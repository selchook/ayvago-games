import Phaser from 'phaser';
import { asset } from './assets';
import { sdk } from './sdk';

// Player characters (protocol 2.2): players pick one of ten characters in their ayvago.com profile
// and the platform sends the id in GHA_START (`character`, and `peerCharacter` in online matches).
// Games with a hero load its poses from here instead of a fixed sprite. The ids are the contract
// with the platform (packages/shared there); the art is built by tools/import-characters.py.

export const CHARACTER_IDS = [
  'alien-green',
  'alien-blue',
  'alien-pink',
  'alien-yellow',
  'alien-beige',
  'adventurer',
  'explorer',
  'rookie',
  'soldier',
  'zombie',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER: CharacterId = 'alien-green';

export const CHARACTER_POSES = [
  'stand', 'front', 'walk1', 'walk2', 'jump', 'hit', 'duck', 'climb1', 'climb2', 'swim1', 'swim2',
] as const;

export type CharacterPose = (typeof CHARACTER_POSES)[number];

/**
 * Every pose of every character shares one frame: 144x176, feet 2 px above the bottom edge,
 * standing pose 150 px tall and centred. Size a hero by `standHeight` and anchor it at
 * `originY` (the feet), and any character fits the same spot.
 */
export const CHARACTER_FRAME = { width: 144, height: 176, standHeight: 150, originY: 174 / 176 } as const;

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

// `?character=<id>` overrides the choice on the game's own URL, for testing and the studio portal.
function override(): CharacterId | null {
  try {
    const id = new URLSearchParams(location.search).get('character');
    return isCharacterId(id) ? id : null;
  } catch {
    return null;
  }
}

/** The player's character: their choice on ayvago.com, else the default. */
export function playerCharacter(): CharacterId {
  const chosen = sdk.adapter?.config?.character;
  return override() ?? (isCharacterId(chosen) ? chosen : DEFAULT_CHARACTER);
}

/** The opponent's character in an online match; one that differs from the player's otherwise. */
export function peerCharacter(): CharacterId {
  const chosen = sdk.adapter?.multiplayer.peerCharacter;
  if (isCharacterId(chosen)) return chosen;
  return otherCharacters(playerCharacter())[0];
}

/** The characters left after excluding some, in display order: rivals, bots, crowds. */
export function otherCharacters(...exclude: CharacterId[]): CharacterId[] {
  return CHARACTER_IDS.filter((id) => !exclude.includes(id));
}

/** URL of one pose. */
export function characterUrl(id: CharacterId, pose: CharacterPose): string {
  return asset(`characters/${id}/${pose}.png`);
}

/**
 * Loads poses of a character as textures `${prefix}-${pose}` (e.g. 'pc-stand', 'pc-walk1').
 * Defaults: the player's character, prefix 'pc', every pose.
 */
export function loadCharacter(
  load: Phaser.Loader.LoaderPlugin,
  options: { id?: CharacterId; prefix?: string; poses?: readonly CharacterPose[] } = {},
): void {
  const { id = playerCharacter(), prefix = 'pc', poses = CHARACTER_POSES } = options;
  for (const pose of poses) load.image(`${prefix}-${pose}`, characterUrl(id, pose));
}
