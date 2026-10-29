import Phaser from 'phaser';
import { CHARACTER_FRAME, loadCharacter, otherCharacters, playerCharacter, type CharacterPose } from '@core';

// The player is the character chosen on ayvago.com (textures 'pc-*'); the bots are the other
// characters, all different from the player and from each other ('bot0-*' .. 'bot5-*').
export const MAX_BOTS = 6;
export const BOT_PREFIXES = Array.from({ length: MAX_BOTS }, (_, k) => `bot${k}`);
const POSES: readonly CharacterPose[] = ['front', 'walk1', 'walk2', 'hit'];

/** Actors stand 57 px tall (as the old aliens) with their feet 8 px below the sprite's position. */
export const ACTOR_SCALE = 57 / CHARACTER_FRAME.standHeight;
export const ACTOR_ORIGIN_Y = CHARACTER_FRAME.originY - 8 / ACTOR_SCALE / CHARACTER_FRAME.height;

export function loadCast(load: Phaser.Loader.LoaderPlugin): void {
  loadCharacter(load, { poses: POSES });
  const bots = otherCharacters(playerCharacter());
  BOT_PREFIXES.forEach((prefix, k) => loadCharacter(load, { id: bots[k % bots.length], prefix, poses: POSES }));
}
