// Safe localStorage wrapper: private mode / blocked storage must never crash a game.
const PREFIX = 'ayvago:';

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

export function getBest(gameId: string): number {
  return storage.get<number>(`best:${gameId}`, 0);
}

/**
 * Takes the player's record from ayvago.com (protocol 2.4, GHA_START `best`) as this browser's
 * best, so "NEW BEST" matches the platform on every device and after an origin change.
 * null means the player has no score yet.
 */
export function adoptPlatformBest(gameId: string, best: number | null): void {
  storage.set(`best:${gameId}`, Math.max(0, best ?? 0));
}

/** Stores the score if it beats the best; returns true on a new record. */
export function submitBest(gameId: string, score: number): boolean {
  if (score > getBest(gameId)) {
    storage.set(`best:${gameId}`, score);
    return true;
  }
  return false;
}
