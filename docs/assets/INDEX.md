# Asset index (public/assets)

Every pack is CC0; sources and licenses: [LICENSES.md](LICENSES.md). Full file lists with pixel
sizes: `docs/assets/<pack>.txt`.
Load Kenney art with `kenney('<pack>/<path>')`; Kenney audio with
`loadSfx(load, key, '<pack>/<path-without-ext>')`; other audio with
`loadAudio(load, key, 'oga/<pack>/<path-without-ext>')`.

| pack | images | sounds |
|---|---|---|
| characters | 140 | 0 |
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

## OpenGameArt CC0 (`public/assets/oga`)

| pack | sounds | list |
|---|---|---|
| junkala-sfx | 512 retro effects: coins, positive/negative, impacts, jumps, lasers, explosions, menu sounds, alarms… | `oga-junkala-sfx.txt` |
| junkala-music | 9 chiptune loops, played by the core (`src/core/music.ts`); games only choose | `oga-junkala-music.txt` |

## characters

The ten player characters players choose on ayvago.com (`src/core/characters.ts`): `alien-green`
(default), `alien-blue`, `alien-pink`, `alien-yellow`, `alien-beige`, `adventurer`, `explorer`,
`rookie`, `soldier`, `zombie`. Each has 11 poses at `characters/<id>/<pose>.png`: `stand`,
`front`, `walk1`, `walk2`, `jump`, `hit`, `duck`, `climb1`, `climb2`, `swim1`, `swim2`. Every
frame is 144x176 with the feet 2 px above the bottom and the standing pose 150 px tall, so one
size and anchor fit all ten. Built by `tools/import-characters.py`.

Rig parts for heroes that hold something with both hands: `archer.png` (the character facing front
without arms, on the same frame), `arm.png` (shoulder at the top) and `hand.png`; the shoulder
points and arm size are in `src/core/character-rig.json` (`characterRig(id)`).

