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

/** Stores the score if it beats the best; returns true on a new record. */
export function submitBest(gameId: string, score: number): boolean {
  if (score > getBest(gameId)) {
    storage.set(`best:${gameId}`, score);
    return true;
  }
  return false;
}
