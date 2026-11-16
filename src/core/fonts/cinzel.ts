// Cinzel: engraved Roman capitals (lower case set as small capitals), the Black weight only, for
// menu themes (src/core/menu-theme.ts; Crystal Keep).
// SIL OFL 1.1, bundled from @fontsource/cinzel (latin + latin-ext, 22 KB, covers Turkish).
// Import it from the game that uses it, so no other game downloads it:
//   import { CINZEL } from '@core/fonts/cinzel';
import './display/cinzel.css';

export const CINZEL = 'Cinzel';

/** The files behind it, for tools that embed the face (scripts/gen-store-assets.mjs). */
export const CINZEL_FILES = ['cinzel-latin-900-normal.woff2', 'cinzel-latin-ext-900-normal.woff2'];
