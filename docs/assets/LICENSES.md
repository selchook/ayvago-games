# Asset licenses

Only **CC0** (public domain) assets are allowed; the one exception is the fonts, which are SIL OFL
(Press Start 2P, Pixelify Sans and the İ face derived from Press Start 2P for retro games; Fredoka and
Nunito for modern games, all bundled from `@fontsource`). Every pack that does not come from Kenney is listed
here with its source page, author and license before it is used. Re-import with the tool named in
the row.

| Pack (`public/assets/…`) | Source | Author | License | Import |
|---|---|---|---|---|
| `kenney/*` | [kenney.nl](https://kenney.nl/assets) | Kenney | CC0 1.0 | `tools/import-kenney.py` |
| `kenney/toy-car-kit`, `kenney/racing-kit-ea` (Toy Car Kit 1.2, Racing Kit 0.1) | [kenney.nl Toy Car Kit](https://kenney.nl/assets/toy-car-kit), [Racing Kit](https://kenney.nl/assets/racing-kit), taken from the mirror [series-ai/jam-ready-assets](https://github.com/series-ai/jam-ready-assets) (`kenney-toy-car-kit/`, `kenney-racing-kit-early-access/`, Git LFS) because kenney.nl is not reachable from the build machines; each pack's own `License.txt` is kept as `license.txt` next to the models | Kenney | CC0 1.0 | `tools/import-kenney.py <jam-ready-assets checkout> toy-car-kit racing-kit-ea` |
| `characters/*` (the five player characters) | Kenney [Platformer Characters 1](https://kenney.nl/assets/platformer-characters-1) | Kenney | CC0 1.0 | `tools/import-characters.py <kenney.nl mirror>` |
| `src/core/fonts/ayvago-pixel-tr.woff` ("Ayvago Pixel TR": only the capital dotted I, U+0130) | Modified from [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (`@fontsource/press-start-2p`) | The Press Start 2P Project Authors; modified for Ayvago | SIL OFL 1.1 (`src/core/fonts/OFL.txt`); renamed because "Press Start 2P" is a Reserved Font Name | `python3 tools/build-tr-font.py` |
| `oga/junkala-sfx` | [The Essential Retro Video Game Sound Effects Collection (512 sounds)](https://opengameart.org/content/512-sound-effects-8-bit-style) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-sfx <zip>` |
| `oga/junkala-music` (`level-1..3`, `title-screen`, `ending`) | [5 Chiptunes (Action)](https://opengameart.org/content/5-chiptunes-action) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |
| `oga/junkala-music` (`1-stage-1`, `2-stage-2`, `3-boss-fight`, `4-stage-select`) | [4 Chiptunes (Adventure)](https://opengameart.org/content/4-chiptunes-adventure) | Juhani Junkala (SubspaceAudio) | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |

Not allowed: CC-BY or any license that needs attribution in the game (OpenGameArt and Freesound
list many), Sonniss GDC bundles (no redistribution of the raw files in a public repository) and
the Pixabay license.
