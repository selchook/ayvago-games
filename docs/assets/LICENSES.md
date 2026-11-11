# Asset licenses

Only **CC0** (public domain) assets are allowed; the one exception is the fonts, which are SIL OFL
(Press Start 2P, Pixelify Sans and the İ face derived from Press Start 2P for retro games; Fredoka and
Nunito for modern games, all bundled from `@fontsource`). Every pack that does not come from Kenney is listed
here with its source page, author and license before it is used. Re-import with the tool named in
the row.

| Pack (`public/assets/…`) | Source | Author | License | Import |
|---|---|---|---|---|
| `kenney/*` | [kenney.nl](https://kenney.nl/assets) | Kenney | CC0 1.0 | `tools/import-kenney.py` |
| `kenney/pirate-kit` (33 of the kit's GLB models + `Textures/colormap.png`, the ones Pirate Cove loads) | Kenney [Pirate Kit](https://kenney.nl/assets/pirate-kit) 2.1 (created 2026-02-17); kenney.nl is not reachable from the build sandbox, so the files came from a public GitHub copy of the unmodified zip (`github.com/4iwen/Voxerra`, `game/assets/models/kenney_pirate-kit/`, Git LFS) and were checked against the zip's own `License.txt`, kept as `kenney/pirate-kit/license.txt` | Kenney | CC0 1.0 | `tools/import-kenney.py <dir with kenney_pirate-kit/> pirate-kit` (only the models in its `PICK` list) |
| `characters/*` (the five player characters) | Kenney [Platformer Characters 1](https://kenney.nl/assets/platformer-characters-1) | Kenney | CC0 1.0 | `tools/import-characters.py <kenney.nl mirror>` |
| `src/core/fonts/ayvago-pixel-tr.woff` ("Ayvago Pixel TR": only the capital dotted I, U+0130) | Modified from [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (`@fontsource/press-start-2p`) | The Press Start 2P Project Authors; modified for Ayvago | SIL OFL 1.1 (`src/core/fonts/OFL.txt`); renamed because "Press Start 2P" is a Reserved Font Name | `python3 tools/build-tr-font.py` |
| `oga/junkala-sfx` | [The Essential Retro Video Game Sound Effects Collection (512 sounds)](https://opengameart.org/content/512-sound-effects-8-bit-style) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-sfx <zip>` |
| `oga/junkala-music` (`level-1..3`, `title-screen`, `ending`) | [5 Chiptunes (Action)](https://opengameart.org/content/5-chiptunes-action) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |
| `oga/junkala-music` (`1-stage-1`, `2-stage-2`, `3-boss-fight`, `4-stage-select`) | [4 Chiptunes (Adventure)](https://opengameart.org/content/4-chiptunes-adventure) | Juhani Junkala (SubspaceAudio) | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |

Not allowed: CC-BY or any license that needs attribution in the game (OpenGameArt and Freesound
list many), Sonniss GDC bundles (no redistribution of the raw files in a public repository) and
the Pixabay license.
