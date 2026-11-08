// Easy / Normal difficulty (protocol 2.6). A game opts in with `difficulty: true` in its
// definition; the menu then offers a two-segment toggle and the player's choice is stored per game.
// Easy runs are practice: GHA_END reports the difficulty and the platform keeps easy runs off the
// leaderboards (and gives less XP), so the local best is not updated in Easy either.
// Online matches are always Normal.
import { storage } from './storage';
import { currentGame } from './registry';
import { net } from './net';
import type { Difficulty } from './ayvago/adapter';

export type { Difficulty };

const key = (gameId: string) => `difficulty:${gameId}`;

/** True when the running game offers Easy/Normal (and this is not an online match). */
export function offersDifficulty(): boolean {
  let opted = false;
  try {
    opted = !!currentGame().difficulty;
  } catch {
    return false;   // no game launched yet
  }
  return opted && !net.active;
}

/** The difficulty of the current run: 'normal' unless the game opts in and the player chose Easy. */
export function difficulty(): Difficulty {
  if (!offersDifficulty()) return 'normal';
  return storage.get<string>(key(currentGame().meta.id), 'normal') === 'easy' ? 'easy' : 'normal';
}

export function isEasy(): boolean {
  return difficulty() === 'easy';
}

/** Stores the player's choice for this game (ignored by games that do not opt in). */
export function setDifficulty(d: Difficulty): void {
  let id: string;
  try {
    if (!currentGame().difficulty) return;
    id = currentGame().meta.id;
  } catch {
    return;
  }
  storage.set(key(id), d === 'easy' ? 'easy' : 'normal');
}
