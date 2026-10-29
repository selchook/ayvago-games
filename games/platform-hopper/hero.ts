import { CHARACTER_FRAME } from '@core';

// The hero is the player's chosen character ('pc-*' textures). It keeps the old alien's size
// (73.5 px standing), its feet 64 px below the sprite's position, and the same 32x68 px body
// whose bottom is the feet, so every level plays exactly as before.
const FH = CHARACTER_FRAME.height;
const FEET = CHARACTER_FRAME.originY * FH;                      // feet, in frame pixels
export const HERO_SCALE = 73.5 / CHARACTER_FRAME.standHeight;
export const HERO_ORIGIN_Y = (FEET - 64 / HERO_SCALE) / FH;
const BODY_W = 32 / HERO_SCALE;
const BODY_H = 68 / HERO_SCALE;
/** Arcade body in frame pixels: [width, height, offsetX, offsetY]. */
export const HERO_BODY = [BODY_W, BODY_H, (CHARACTER_FRAME.width - BODY_W) / 2, FEET - BODY_H] as const;
