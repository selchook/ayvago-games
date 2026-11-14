# Asset index (public/assets)

Every pack is CC0; sources and licenses: [LICENSES.md](LICENSES.md). Full file lists with pixel
sizes: `docs/assets/<pack>.txt`.
Load Kenney art with `kenney('<pack>/<path>')`; Kenney audio with
`loadSfx(load, key, '<pack>/<path-without-ext>')`; other audio with
`loadAudio(load, key, 'oga/<pack>/<path-without-ext>')`.

| pack | images | sounds |
|---|---|---|
| characters | 135 | 0 |
| alien-ufo | 46 | 0 |
| animals | 60 | 0 |
| boardgame | 523 | 0 |
| emotes | 240 | 0 |
| fish | 126 | 0 |
| foliage | 212 | 0 |
| fonts | 0 | 0 |
| game-icons | 416 | 0 |
| hexagon | 312 | 0 |
| jingles | 0 | 17 |
| jumper | 121 | 0 |
| letter-tiles | 216 | 0 |
| medals | 30 | 0 |
| micro-roguelike | 144 | 0 |
| onebit | 9 | 0 |
| onscreen-controls | 100 | 0 |
| particles | 96 | 0 |
| planets | 4 | 0 |
| physics | 333 | 0 |
| pixel-platformer | 903 | 0 |
| pixel-ui | 35 | 0 |
| platformer | 418 | 0 |
| puzzle | 78 | 0 |
| puzzle2 | 795 | 0 |
| racing | 423 | 0 |
| sfx-casino | 0 | 54 |
| sfx-digital | 0 | 62 |
| sfx-impact | 0 | 130 |
| sfx-interface | 0 | 100 |
| sfx-foley | 0 | 10 |
| sfx-sci-fi | 0 | 8 |
| sfx-ui | 0 | 51 |
| shooting-gallery | 110 | 0 |
| simple-platformer | 91 | 0 |
| sokoban | 102 | 0 |
| space-shooter | 294 | 7 |
| sports | 187 | 0 |
| tanks | 86 | 0 |
| tappy-plane | 79 | 0 |
| topdown-shooter | 581 | 0 |
| tower-defense | 299 | 0 |
| ui | 151 | 6 |

## Kenney 3D kits (`public/assets/kenney`, GLB models)

For 3D games (`@core/three`). Load a model in preload with
`loadKenney3d(load, key, '<kit>', '<name>')`, then `model(key)` gives a copy. The lists in
`docs/assets/<kit>.txt` give every model's file size and bounding box (in model units; one
platformer-kit block is about 1.27 wide). Regenerate them with `node tools/index-3d.mjs <kit>`.

| kit | models | source |
|---|---|---|
| car-kit | 28 | Kenney Car Kit: cars, trucks, a tractor, loose wheels |
| platformer-kit | 74 | Kenney Platformer Kit: grass and snow blocks, coins, crates, spikes, hearts, trees, fences, flags |
| nature-kit | 329 | Kenney Nature Kit: trees, rocks, plants, cliffs, paths, tents, log bridges |
| minigolf-kit | 57 | Kenney Minigolf Kit 2.0: course tiles (straights, corners, ramps, hills, bumps, gaps, tunnels, splits, holes), a castle, a windmill with separate sails, flags, balls, clubs |
| racing-kit | 112 | Kenney Racing Kit: grandstands, tents, flags, banners, barriers, fences, pylons, light towers, ramps, road pieces, trees, race cars |
| pirate-kit | 33 | Kenney Pirate Kit 2.1, in part: pirate ships (small, medium), navy ships (small, medium, large), the ghost ship, a wreck, cannon, cannonball, chest, barrel, bottle, crate, sand and grass island patches, palms, rocks, a fort tower, castle walls and gate, a watchtower, a hut and roof, a dock, a pirate flag. Ships have separate `sail-*` and `flag-*` meshes (furl them by scaling). The models share `models/gltf_format/Textures/colormap.png` (external, loaded next to the GLB); only what `games/pirate-cove` uses is imported |
| mini-characters | 21 | Kenney Mini Characters 2.0: rigged people with 32 animation clips each (idle, walk, sprint, jump, fall, crouch, sit, die, emote-yes/no, holding-*, attack-*, interact-* …) on one skeleton (root, torso, head, arm-left/right, leg-left/right), plus weapons and a shield. The models share `models/gltf_format/Textures/colormap.png` (external, loaded next to the GLB). Only the files a game uses are imported: `character-male-a` … `g`, `character-female-f`, `character-soldier`, `character-zombie`, `character-raider`, `character-alien`, `character-robot`, `character-knight`, `character-worker`, `weapon-bow`, `weapon-sword`, `weapon-spear`, `weapon-shooter`, `weapon-arrow`, `shield-round` (`MINI_CHARACTERS` in `tools/import-kenney.py`, from the owner's 2.0 zip). Load with `loadMiniCharacter()` or, for the player's platform character, `loadCharacter3d()` (`@core/three`, mapping in `CHARACTER_MODELS`) |
| mini-forest | 22 | Kenney Mini Forest 1.0 (the owner's zip, whole pack): `tree`, `tree-high`, `plant`, rocks (`rocks-low`, `rocks-high`, `rocks-ramp`, `stones`), ground patches (`patch-grass`, `patch-dirt`), the camp (`tent`, `building-platform`, `building-structure`, `building-roof`, `platform`, `ladder`, `bridge`, `fence`, `flag`, `target`), the rigged `character-archer` (same skeleton and 32 clips as Mini Characters), `weapon-bow` and `weapon-arrow`. One mesh and one material per model; they share `models/gltf_format/Textures/colormap.png` (external). About one unit per tile; pivots at the base, centred |
| toy-car-kit | 2 | Kenney Toy Car Kit 1.2: the chunky monster truck (`vehicle-monster-truck`: body with suspension arms and axles, four separate wheel nodes `wheel-fl/fr/bl/br` centred on their hubs) and the pickup (`vehicle-suv`). Textured: the models share `models/gltf_format/Textures/colormap.png` (8×4 cells of 64×128 px gradient swatches; the purple body paint is cell 7, 2). Only the files a game uses are imported (`FILES` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| racing-kit-ea | 6 | Kenney Racing Kit 0.1 (early access, 2026), textured with a shared `models/gltf_format/Textures/colormap.png`: the inflatable striped arch, a row of striped barrels, two tents, green and yellow flags. Only the files a game uses are imported (`FILES` in `tools/import-kenney.py`) |
| tower-defense-kit | 59 | Kenney Tower Defense Kit 2.0, in part: green and snow ground tiles (path straights, round corners, round ends, splits, spawn pads, trees, rocks, crystals, hills), the river straight and bridge, scenery details, modular round (red) and square (purple) tower pieces (bottoms, middles, crenellated tops, the crystal cluster), the ballista / cannon / catapult / turret weapons (each with a separate moving part: `arrow`, `barrel`, `catapult`), their ammo, three UFOs and the selection marker. The models share `models/gltf_format/Textures/colormap.png` (external; the river's water samples its bottom edge, so clamp the texture). Only what `games/crystal-keep` uses is imported (`PICK` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| food-kit | 19 | Kenney Food Kit 2.0, in part: burgers (`burger-cheese` plain, `burger` with lettuce and tomato), the grill-marked `meat-patty`, `meat-sausage`, `hot-dog`, `fries`, the `soda` cup, `ice-cream` and its empty cone `ice-cream-cne`, `cabbage`, `tomato`, `plate`, the deep `pot`, `bread`, ketchup and mustard bottles, salt and pepper shakers, `cupcake`. Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Food models sit centred on x/z with the base at y = 0. Only what `games/snack-shack` uses is imported (`FOOD_KIT` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| furniture-kit | 20 | Kenney Furniture Kit 2.1, in part: kitchen pieces (`kitchenBar`/`kitchenBarEnd` counter, `kitchenCabinet`, gas `kitchenStove`, `kitchenStoveElectric`, `kitchenCoffeeMachine`, `kitchenFridgeLarge`, `kitchenMicrowave`), the bar stool `stoolBar`, walls (`wall`, `wallWindow`, `wallDoorway`), plants, a trash can, radio, TV, a rug, a round table and a chair. Untextured: every part carries its own material colour (wood, metal, carpet …). Pivots sit at the back-left corner with the front at z = 0 (file names are lowercased: `kitchenbar.glb`). Only what `games/snack-shack` uses is imported (`FURNITURE_KIT` in `tools/import-kenney.py`) |
| mini-dungeon | 20 | Kenney Mini Dungeon 1.6, in part: floor tiles (`floor`, `floor-detail`), wall blocks (`wall` lit on every side, `wall-half` lit on its +z face with a dark top, `wall-opening` doorway), the portcullis `gate` (its `door` node slides; the kit's `open` clip raises it 0.75), `chest` (separate `lid` node hinged at (0, 0.2, −0.2)), `coin`, the spike `trap` (separate `spikes` node, −0.15 when hidden), `barrel`, `banner` (hangs on the −z wall face), `column`, `stairs`, `rocks`, `stones`, `wood-structure`, `weapon-sword`, `weapon-spear`, `shield-round` and the rigged `character-orc` (the Mini Characters skeleton and all 32 clips). Textured: the models share `models/gltf_format/Textures/colormap.png`; the kit's second palette `models/Textures/variation-a.png` (same layout, blue and gold accents) is imported for deeper floors. Only what `games/crypt-crawler` uses is imported (`MINI_DUNGEON` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| graveyard-kit | 15 | Kenney Graveyard Kit 5.0, in part: the node-rigged characters `character-skeleton`, `character-ghost`, `character-zombie`, `character-vampire` (one mesh per limb node, no skin: `root`, `torso`, `head`, `arm-left/right`, `leg-left/right`, with the same 32 clips as the Mini Characters), `candle`, `candle-multiple`, `fire-basket`, `urn-round` / `urn-square` (separate `lid`), `altar-stone`, `lantern-candle`, `pillar-large`, `debris`, `coffin` (separate `lid`), `gravestone-cross`. Textured: the models share `models/gltf_format/Textures/colormap.png`. Only what `games/crypt-crawler` uses is imported (`GRAVEYARD_KIT` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| city-kit-commercial | 13 | Kenney City Kit Commercial 2.1, in part: shops and offices (`building-a`, `-c`, `-e`, `-g`, `-h`, `-k`), three skyscrapers (`building-skyscraper-a` … `c`), the low-detail far buildings (`low-detail-building-a`, `-c`, `-wide-a`) and a parasol. About 1 unit per city block (building-a is 0.88 × 1.29 × 0.94). Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Only what `games/blacktop-kings` uses is imported (`CITY_KIT_COMMERCIAL` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| city-kit-roads | 4 | Kenney City Kit Roads 2.0, in part: the street lamps `light-square` and `light-curved`, the `road-straight` tile (1 × 1) and a `construction-cone`. Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Only what `games/blacktop-kings` uses is imported (`CITY_KIT_ROADS` in `tools/import-kenney.py`) |
| space-kit | 35 | Kenney Space Kit 2.0, in part: spacecraft (`craft_speedera` … `d`, `craft_racer`, `craft_miner`, `craft_cargoa` / `b`; the nose points to −z), meteors and rocks (`meteor`, `meteor_detailed`, `rock_largea`, crystal rocks), turrets (`turret_single`, `turret_double`, each with a separate `turret` node that turns), `machine_generatorlarge`, hangars (`hangar_rounda`, the glass dome `hangar_roundglass`, `hangar_largea`), satellite dishes, a frame structure, pipes, a platform, rocket parts, craters, a gate, a corridor piece. Untextured: every part carries its own flat material (`metal`, `metalDark`, `metalRed`, `dark`, `rock`, `crystal` …); file names are lowercased (`craft_speedera.glb`). Only what `games/star-squadron` uses is imported (`SPACE_KIT` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| mini-skate | 20 | Kenney Mini Skate 1.2, complete: ramps (`half-pipe` is the wooden quarter pipe, `bowl-side` the concrete one: 1 × 0.8 × 1, a circular transition of radius 0.8 rising towards −z with a 0.2 deck; `bowl-corner-inner` / `-outer` for bowls), `obstacle-middle` (a 1-long hip with a rail on its spine, along z) and its round cap `obstacle-end`, the low `obstacle-box` pad, `steps` (four 0.1 steps rising towards −z), rails (`rail-low` 0.25 and `rail-high` 0.45 high, 1 long along z; `rail-slope`; `rail-curve`, a quarter circle), `pallet`, the deck `structure-platform` (half a tile, 0.8 high) and the scaffold `structure-wood`, `floor-concrete` / `floor-wood` tiles, `skateboard` (0.3 × 0.14 × 0.7, along z) and two rigged skaters (`character-skate-boy`, `character-skate-girl`: the Mini Characters skeleton with its 32 clips plus `skate` (push), `skate-stand`, `skate-air` and `skate-grab`, which also drive any other Mini Character). Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Imported from the jam-ready-assets mirror (`MINI_SKATE` in `tools/import-kenney.py`) |
| city-kit-suburban | 12 | Kenney City Kit Suburban 2.0, in part: eight houses (`building-type-a`, `-b`, `-c`, `-d`, `-f`, `-k`, `-m`, `-o`; about 1.3 × 1 × 1 units), `fence-1x4`, `planter`, `tree-large`, `tree-small`. Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Only what `games/kickflip-park` uses is imported (`CITY_KIT_SUBURBAN` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| road-pack | 21 | Kenney Road Pack 1.0 ("3D Road Tiles"), in part. The pack's 294 tiles are only numbered (`tile000` … `tile293`); `games/delivery-dash/tiles.ts` catalogues all of them (kind, shape, open sides, road family, level), read from their edge materials and heights. Every tile is 1 × 1 units, centred on x/z with its base at y = 0; road surfaces sit at y = 0.2 (raised decks 0.567). Untextured, flat colours per material (`asphalt`, `pavement`, `grass`, `water`, `striping` …, KHR_materials_unlit). Imported: city road (`tile017` straight, `026` crosswalk, `085` corner, `011` T, `021` crossing, `029` dead end, `005` slope), suburban road with verges (`034`, `169`, `059`, `027`, `047`, `103`, `041`), bridges `203` (humped) and `119` (flat), river `078`, water `053`, blocks `157` (pavement), `084` (lawn), `092` (lawn with paved edge). Only what `games/delivery-dash` uses is imported (`ROAD_TILES` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| city-kit-industrial | 10 | Kenney City Kit Industrial 1.0, in part: warehouses and factories (`building-a`, `-b`, `-g`, `-h`, `-k`, `-p`, `-s`; pivots are not always centred, see the boxes in `city-kit-industrial.txt`), `chimney-large`, `chimney-medium` and the `detail-tank`. Textured: the models share `models/gltf_format/Textures/colormap.png` (external). Only what `games/kickflip-park` uses is imported (`CITY_KIT_INDUSTRIAL` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| holiday-kit | 30 | Kenney Holiday Kit 2.0, in part: log-cabin modules on a 1-unit grid (walls sit on the +z edge of their cell at z 0.35–0.65: `cabin-doorway`, `cabin-window-a` / `-b`, `cabin-wall`; `cabin-corner-logs` at the cell's −x/+z corner; `cabin-wall-roof-center` is the triangular gable above a 1-wide wall; `cabin-roof-snow-point` is a whole snowy gable roof over one cell, ridge along z), presents (`present-a-cube`, `present-a-rectangle`, `present-b-round`: white wrapping in the colormap's white swatch, red ribbons), snowy trees (`tree-snow-a` … `c`, `tree-decorated-snow`), snowy `rocks-small` / `-medium` / `-large`, `snow-pile`, `snow-bunker`, `snow-flat`, `snowman-hat`, `reindeer`, `sled`, `bench`, `lantern` (a street lamp), `lights-colored` (a string of fairy lights, 1 wide), `wreath-decorated`, `candy-cane-red`, `gingerbread-man`, `nutcracker`. Textured: the models share `models/gltf_format/Textures/colormap.png` (external; 64 × 128 px colour swatches, so a part can be recoloured by moving its UVs to another swatch, see `games/snow-express/kit.ts`). Imported from the jam-ready-assets mirror (`HOLIDAY_KIT` in `tools/import-kenney.py`) |
| train-kit | 5 | Kenney Train Kit 1.1, in part: `track` (one 1 × 1 piece of rails on three sleepers, along z, to bend along any path), the steam `train-locomotive-a` (green body), the express `train-electric-bullet-a` (blue body), the yellow `train-diesel-a` and the `train-carriage-flatbed`; vehicles face +z, about 1.2 wide and 2.4–2.8 long. Textured: they share `models/gltf_format/Textures/colormap.png` (external, the same swatch layout as the Holiday Kit's). Imported from the jam-ready-assets mirror (`TRAIN_KIT` in `tools/import-kenney.py`) |
| retro-urban-kit | 61 | Kenney Retro Urban Kit 2.0, in part: one-tile building blocks (`wall-a*` brick, `wall-a-painted` plaster, `wall-b*` green metal panels, `wall-c-flat` bars; each 1 × 1 × 1 unit with a concrete top, windows, doors and garages as variants), roofs and slants (`wall-a-roof*`, `wall-b-roof*`, `roof-metal-type-a/b`: 1 × 0.5 × 1), low walls (`wall-type-a/b`, `wall-fence`, `wall-broken-type-a`), fire escapes (`balcony-type-a`, `balcony-ladder-bottom/top`), awnings, cables (`detail-cables-type-a/b`: a 1-unit textured span), `detail-beam` (0.26 × 0.25 × 1 along z), `planks`, pallets, barriers, dumpsters, `detail-block`, street lamps, scaffolding (`scaffolding-structure`, `-floor`, `-poles`), trees (cross billboards, alpha-blended), trucks and street tiles. Pivots sit at the bottom centre. Textured with 22 separate 64 px textures in `models/gltf_format/Textures/` (128 px for the trucks), referenced by the GLBs; UVs repeat. Only what `games/rooftop-courier` uses is imported (`RETRO_URBAN_KIT` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |

## OpenGameArt CC0 (`public/assets/oga`)

| pack | sounds | list |
|---|---|---|
| junkala-sfx | 512 retro effects: coins, positive/negative, impacts, jumps, lasers, explosions, menu sounds, alarms… | `oga-junkala-sfx.txt` |
| junkala-music | 9 chiptune loops, played by the core (`src/core/music.ts`); games only choose | `oga-junkala-music.txt` |

## characters

The five player characters players choose on ayvago.com (`src/core/characters.ts`): `adventurer`
(default), `explorer`, `rookie`, `soldier`, `zombie`.

**Poses.** Each has the 24 poses of Kenney Platformer Characters 1 at
`characters/<id>/<pose>.png`:
- `stand`, `front`, `walk1`, `walk2`, `jump`, `fall`, `hit`, `duck`
- `kick`, `hang`, `slide`, `skid`
- `cheer1`, `cheer2`, `hold1`, `hold2`, `action1`, `action2`
- `climb1`, `climb2`, `swim1`, `swim2`
- `back`, `talk`

All poses face right except `front` and `back`.

**Frame.** Every frame is 144x176 with the feet 2 px above the bottom and the standing pose
150 px tall, so one size and anchor fit all five. Built by `tools/import-characters.py`.

**Rig parts**, for heroes whose arms follow something every frame (`games/archery`):
- `archer.png`: the character facing front without arms, on the same frame;
- `arm.png`: an arm, with the shoulder at the top;
- `hand.png`: a hand.

**Owner-supplied models** (`public/assets/boards`, not CC0: a deliberate, owner-approved exception,
see [LICENSES.md](LICENSES.md#owner-supplied-assets)):

| file | what |
|---|---|
| `boards/skateboard3d_black.glb` | the owner's black skateboard (Kickflip Park's default board "Black Pro"): 0.98 × 0.18 × 0.29 in its own units, long along x (the game's board fitter turns it), one quantized mesh `board` with a 512 px texture (black grip, wooden edges, white wheels); simplified from the 60 MB Tripo export to about 530 KB |
| `boards/blueskateboard3d.glb` | the owner's blue skateboard (Kickflip Park's "Blue Cruiser", which opens with Timber Yard, and its colourways Crimson and Jade): 1.0 × 0.29 × 0.4 in its own units, rolled on its side (the game's board fitter stands it up), three meshes named by their material: `deck` (512 px graffiti texture), `truck` and `wheel` (256 px atlases); optimised from the 1.9 MB Tripo export to about 300 KB |

**Rig points.** `src/core/character-rig.json` (`characterRig(id)`) holds, per character:
- the shoulder points and the arm size;
- `kickFoot`: the foot tip in `kick`;
- `hangHand`: the raised fist in `hang`.
