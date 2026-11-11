// Ayvago platform bridge. Wraps the official platform adapter (src/core/ayvago/adapter.ts,
// vendored verbatim from selchook/ayvago packages/platform-adapter) so every game speaks the
// GHA_* protocol: inside the Ayvago iframe it talks to the platform (score sessions,
// leaderboards, pause/mute/locale), on its own URL it falls back to standalone no-ops.
import { createPlatformAdapter, type Difficulty, type GameResult, type PlatformAdapter } from './ayvago/adapter';

export type GameEvent = 'loaded' | 'ready' | 'start' | 'gameOver' | 'pause' | 'resume' | 'adStart' | 'adEnd' | 'continue';

let adapter: PlatformAdapter | null = null;
/** Rewarded continues used in the current run (0 or 1; src/core/ads.ts). */
let runContinues: 0 | 1 = 0;

/**
 * GHA_END payload. `continues` is the platform's finishSession({ continues: 0 | 1 }): a run that
 * went on after a rewarded ad. The vendored adapter (2.7.0) builds GHA_END from score, won,
 * message and difficulty only, so the field reaches the platform once the adapter forwards it.
 */
export type RunResult = GameResult & { continues?: 0 | 1 };

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
    runContinues = 0;
    adapter?.gameplayStart();
  },
  /** Rewarded continues used in this run (0 or 1). */
  get continues(): 0 | 1 {
    return runContinues;
  },
  /** The run goes on after a rewarded ad (same score session, so no new GHA_SESSION_START). */
  markContinue(): void {
    runContinues = 1;
  },
  gameplayStop(): void {
    adapter?.gameplayStop();
  },
  /**
   * End of a run: the platform validates and records the score. `difficulty` (protocol 2.6):
   * easy runs are practice and stay off the leaderboards. A run that used a rewarded continue
   * carries `continues: 1`.
   */
  end(score: number, won: boolean, difficulty?: Difficulty): void {
    const result: RunResult = { score, won, difficulty };
    if (runContinues) result.continues = runContinues;
    adapter?.endGame(result);
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
