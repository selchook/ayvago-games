// Who runs the Ayvago Cup: the player as their ayvago.com character in 3D (the closest Kenney
// Mini Character, see CHARACTER_MODELS in @core/three) and three rivals, each a different male
// Mini Character the player's model is not.
import Phaser from 'phaser';
import { CHARACTER_MODELS, MINI_MALES, miniKey, loadCharacter3d, loadMiniCharacter, playerCharacter3d } from '@core/three';
import { playerCharacter } from '@core';

/** The rivals' names on the boards (proper names, the same in Turkish and English). */
export const RIVAL_NAMES: Record<(typeof MINI_MALES)[number], string> = {
  'character-male-a': 'Kofi',
  'character-male-b': 'Bjorn',
  'character-male-c': 'Marco',
  'character-male-d': 'Rory',
  'character-male-e': 'Hugo',
  'character-male-f': 'Rafa',
  'character-male-g': 'Ivan',
};

/** File name of the player's model. */
export const playerModel = (): string => CHARACTER_MODELS[playerCharacter()];

/** Model key of the player's athlete. */
export const playerKey = (): string => playerCharacter3d();

/** Queues every model the cup may show: the player's and all the male rivals. */
export function loadCast(load: Phaser.Loader.LoaderPlugin): void {
  loadCharacter3d(load);
  for (const m of MINI_MALES) loadMiniCharacter(load, m);
}

/** `n` distinct rival models, never the player's, in random order. */
export function pickRivals(n: number): { model: string; key: string; name: string }[] {
  const me = playerModel();
  const pool = MINI_MALES.filter((m) => m !== me);
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, n).map((m) => ({ model: m, key: miniKey(m), name: RIVAL_NAMES[m] }));
}
