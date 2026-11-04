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

