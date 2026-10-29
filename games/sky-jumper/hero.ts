import { CHARACTER_FRAME } from '@core';

// The jumper is the player's chosen character ('pc-*' textures), 88 px tall standing, with its
// feet 42 px below the sprite's position: the same feet line the platform checks use.
export const HERO_SCALE = 88 / CHARACTER_FRAME.standHeight;
export const HERO_ORIGIN_Y = CHARACTER_FRAME.originY - 42 / HERO_SCALE / CHARACTER_FRAME.height;
