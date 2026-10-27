// Ayvago platform bridge. Wraps the official platform adapter (src/core/ayvago/adapter.ts,
// vendored verbatim from selchook/ayvago packages/platform-adapter) so every game speaks the
// GHA_* protocol: inside the Ayvago iframe it talks to the platform (score sessions,
// leaderboards, pause/mute/locale), on its own URL it falls back to standalone no-ops.
import { createPlatformAdapter, type PlatformAdapter } from './ayvago/adapter';

export type GameEvent = 'loaded' | 'ready' | 'start' | 'gameOver' | 'pause' | 'resume';

let adapter: PlatformAdapter | null = null;

/** Platform game id: the manifest id rules allow only [a-z0-9] (slug without hyphens). */
export function platformId(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const sdk = {
  /** Handshake with the platform (GHA_READY → GHA_START); standalone resolves immediately. */
  async init(slug: string): Promise<PlatformAdapter> {
    adapter = await createPlatformAdapter({ gameId: platformId(slug) });
    return adapter;
  },
  /** True when running inside the Ayvago platform iframe. */
  get embedded(): boolean {
    return adapter?.name === 'ayvago';
  },
  get adapter(): PlatformAdapter | null {
    return adapter;
  },
  loading(progress: number): void {
    adapter?.loadingProgress(progress);
  },
  /** A new run: the platform opens a server score session. */
  gameplayStart(): void {
    adapter?.gameplayStart();
  },
  gameplayStop(): void {
    adapter?.gameplayStop();
  },
  /** End of a run: the platform validates and records the score. */
  end(score: number, won: boolean): void {
    adapter?.endGame({ score, won });
  },
  celebrate(): void {
    adapter?.celebrate();
  },
  openLeaderboard(): void {
    adapter?.openLeaderboard();
  },
  /** Local DOM event for tests and debugging (window 'ayvago:<type>'). Never leaves the page. */
  emit(type: GameEvent, payload: Record<string, unknown> = {}): void {
    window.dispatchEvent(new CustomEvent('ayvago:' + type, { detail: { type, ...payload } }));
  },
};
