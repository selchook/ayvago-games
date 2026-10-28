# Asset licenses

Only **CC0** (public domain) assets are allowed. Every pack that does not come from Kenney is listed
here with its source page, author and license before it is used. Re-import with the tool named in
the row.

| Pack (`public/assets/…`) | Source | Author | License | Import |
|---|---|---|---|---|
| `kenney/*` | [kenney.nl](https://kenney.nl/assets) | Kenney | CC0 1.0 | `tools/import-kenney.py` |
| `oga/junkala-sfx` | [The Essential Retro Video Game Sound Effects Collection (512 sounds)](https://opengameart.org/content/512-sound-effects-8-bit-style) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-sfx <zip>` |
| `oga/junkala-music` (`level-1..3`, `title-screen`, `ending`) | [5 Chiptunes (Action)](https://opengameart.org/content/5-chiptunes-action) | Juhani Junkala | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |
| `oga/junkala-music` (`1-stage-1`, `2-stage-2`, `3-boss-fight`, `4-stage-select`) | [4 Chiptunes (Adventure)](https://opengameart.org/content/4-chiptunes-adventure) | Juhani Junkala (SubspaceAudio) | CC0 1.0 | `tools/import-oga.py junkala-music <zip> --music` |

Not allowed: CC-BY or any license that needs attribution in the game (OpenGameArt and Freesound
list many), Sonniss GDC bundles (no redistribution of the raw files in a public repository) and
the Pixabay license.
