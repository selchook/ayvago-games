// Grenze Gotisch: a sturdy, readable blackletter (heraldic, castle-gate lettering), the ExtraBold
// weight only, for menu themes (src/core/menu-theme.ts; Dungeon Rescue).
// SIL OFL 1.1, bundled from @fontsource/grenze-gotisch (latin + latin-ext, covers Turkish).
// Import it from the game that uses it, so no other game downloads it:
//   import { GRENZE_GOTISCH } from '@core/fonts/grenze-gotisch';
import './display/grenze-gotisch.css';

export const GRENZE_GOTISCH = 'Grenze Gotisch';

/** The files behind it, for tools that embed the face (scripts/gen-store-assets.mjs). */
export const GRENZE_GOTISCH_FILES = ['grenze-gotisch-latin-800-normal.woff2', 'grenze-gotisch-latin-ext-800-normal.woff2'];
