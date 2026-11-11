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
| mini-characters | 11 | Kenney Mini Characters 2.0: rigged people with 32 animation clips each (idle, walk, sprint, jump, fall, crouch, sit, die, emote-yes/no, holding-*, attack-*, interact-* …) on one skeleton, plus the bow. The models share `models/gltf_format/Textures/colormap.png` (external, loaded next to the GLB). Only the files a game uses are imported: `character-male-a` … `g`, `character-female-f`, `character-soldier`, `character-zombie`, `weapon-bow`. Load with `loadMiniCharacter()` or, for the player's platform character, `loadCharacter3d()` (`@core/three`, mapping in `CHARACTER_MODELS`) |
| toy-car-kit | 2 | Kenney Toy Car Kit 1.2: the chunky monster truck (`vehicle-monster-truck`: body with suspension arms and axles, four separate wheel nodes `wheel-fl/fr/bl/br` centred on their hubs) and the pickup (`vehicle-suv`). Textured: the models share `models/gltf_format/Textures/colormap.png` (8×4 cells of 64×128 px gradient swatches; the purple body paint is cell 7, 2). Only the files a game uses are imported (`FILES` in `tools/import-kenney.py`, from the jam-ready-assets mirror) |
| racing-kit-ea | 6 | Kenney Racing Kit 0.1 (early access, 2026), textured with a shared `models/gltf_format/Textures/colormap.png`: the inflatable striped arch, a row of striped barrels, two tents, green and yellow flags. Only the files a game uses are imported (`FILES` in `tools/import-kenney.py`) |

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

**Rig points.** `src/core/character-rig.json` (`characterRig(id)`) holds, per character:
- the shoulder points and the arm size;
- `kickFoot`: the foot tip in `kick`;
- `hangHand`: the raised fist in `hang`.

