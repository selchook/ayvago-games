/**
 * Ayvago platform adapter (protocol 2, v1-compatible GHA_* messages).
 *
 * A single, dependency-free file that games vendor (copy) into their own repository. At runtime
 * it decides whether the game runs inside Ayvago (embedded in an iframe on an allowed platform
 * origin that answers the handshake) or standalone (its own URL), and exposes the same API in
 * both cases so a game ships one build.
 *
 * Source of truth: selchook/ayvago, packages/platform-adapter/src/adapter.ts.
 * Update vendored copies by copying this file; do not edit them in place.
 */

export const ADAPTER_VERSION = '2.0.0';
export const PROTOCOL_VERSION = 2;

/** Origins allowed to host games. "*" matches one DNS label segment (letters, digits, "-"). */
export const DEFAULT_PLATFORM_ORIGINS = [
  'https://ayvago.com',
  'https://www.ayvago.com',
  'https://ayvago-*.vercel.app',
  'http://localhost:3000',
];

export type ColorMode = 'light' | 'dark';

export type ThemeInfo = {
  theme: string;
  colorMode: ColorMode;
  /** CSS custom properties ("--accent" → "#3a4ddc"), including legacy GHA names. */
  tokens: Record<string, string>;
};

export type StartConfig = ThemeInfo & {
  mode: 'solo' | 'multiplayer';
  isHost: boolean;
  playerIndex: number;
  playerCount: number;
  locale: string;
  adsEnabled: boolean;
  protocol: number;
};

export type GameResult = { score?: number; won?: boolean; message?: string };

export interface PlatformAdapter {
  readonly name: 'ayvago' | 'standalone';
  /** Platform locale inside Ayvago ("en", "tr"), the browser language standalone. */
  readonly locale: string;
  /** The configuration received from the platform; null when standalone. */
  readonly config: StartConfig | null;
  loadingProgress(progress: number): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Mid-run score checkpoint. */
  submitScore(score: number): void;
  /** End of a run; the platform validates and records the score. */
  endGame(result: GameResult): void;
  /** Resolves true only when the player watched the ad and earned the reward. */
  requestRewarded(placement: string): Promise<boolean>;
  /** Always resolves (also when no ad is shown), so game flow never waits forever. */
  requestInterstitial(placement: string): Promise<void>;
  /** A highlight moment (personal best, level cleared). */
  celebrate(): void;
  openLeaderboard(): void;
  onPause(callback: () => void): () => void;
  onResume(callback: () => void): () => void;
  onMute(callback: (muted: boolean) => void): () => void;
  onThemeChange(callback: (theme: ThemeInfo) => void): () => void;
  onLocaleChange(callback: (locale: string) => void): () => void;
  /** Writes the platform theme tokens as CSS custom properties (default: <html>). */
  applyThemeTokens(target?: { style: { setProperty(name: string, value: string): void } }): void;
}

/** The browser surface the adapter needs; replaced by a fake in tests. */
export interface HostEnv {
  embedded: boolean;
  parentOrigin: string | null;
  language: string;
  post(message: Record<string, unknown>, targetOrigin: string): void;
  listen(handler: (data: unknown, origin: string, fromParent: boolean) => void): () => void;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  rootStyle: { setProperty(name: string, value: string): void } | null;
}

export type AdapterOptions = {
  gameId: string;
  platformOrigins?: string[];
  /** How long to wait for the platform's GHA_START before falling back to standalone. */
  handshakeTimeoutMs?: number;
  /** How long to wait for an ad result before giving up (the ad counts as not shown). */
  adTimeoutMs?: number;
  env?: HostEnv;
};

type Listener<T> = (value: T) => void;

function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
  return new RegExp(`^${escaped}$`).test(origin);
}

export function isAllowedPlatformOrigin(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => originMatches(origin, pattern));
}

export function browserEnv(): HostEnv {
  const w = window;
  let embedded = false;
  try {
    embedded = w.self !== w.top;
  } catch {
    // Accessing window.top can throw for cross-origin parents in old browsers: we are embedded.
    embedded = true;
  }
  let parentOrigin: string | null = null;
  const ancestors = (w.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0) parentOrigin = ancestors[0] ?? null;
  else if (document.referrer) {
    try {
      parentOrigin = new URL(document.referrer).origin;
    } catch {
      parentOrigin = null;
    }
  }
  return {
    embedded,
    parentOrigin,
    language: (navigator.language || 'en').slice(0, 2).toLowerCase(),
    post: (message, targetOrigin) => w.parent.postMessage(message, targetOrigin),
    listen: (handler) => {
      const onMessage = (event: MessageEvent) =>
        handler(event.data, event.origin, event.source === w.parent);
      w.addEventListener('message', onMessage);
      return () => w.removeEventListener('message', onMessage);
    },
    setTimeout: (callback, ms) => w.setTimeout(callback, ms),
    clearTimeout: (handle) => w.clearTimeout(handle as number),
    rootStyle: document.documentElement.style,
  };
}

class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  add(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    this.listeners.forEach((listener) => {
      try {
        listener(value);
      } catch (error) {
        // A failing game callback must not break the bridge.
        console.error('[ayvago] callback failed', error);
      }
    });
  }
}

class StandaloneAdapter implements PlatformAdapter {
  readonly name = 'standalone' as const;
  readonly config = null;

  constructor(readonly locale: string) {}

  loadingProgress(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  submitScore(): void {}
  endGame(): void {}
  requestRewarded(): Promise<boolean> {
    return Promise.resolve(false);
  }
  requestInterstitial(): Promise<void> {
    return Promise.resolve();
  }
  celebrate(): void {}
  openLeaderboard(): void {}
  onPause(): () => void {
    return () => {};
  }
  onResume(): () => void {
    return () => {};
  }
  onMute(): () => void {
    return () => {};
  }
  onThemeChange(): () => void {
    return () => {};
  }
  onLocaleChange(): () => void {
    return () => {};
  }
  applyThemeTokens(): void {}
}

class AyvagoAdapter implements PlatformAdapter {
  readonly name = 'ayvago' as const;
  private currentConfig: StartConfig;
  private currentLocale: string;
  private nextAdId = 1;
  private pendingAds = new Map<number, (rewarded: boolean, shown: boolean) => void>();
  private pause = new Emitter<void>();
  private resume = new Emitter<void>();
  private mute = new Emitter<boolean>();
  private theme = new Emitter<ThemeInfo>();
  private localeChange = new Emitter<string>();

  constructor(
    private env: HostEnv,
    private origin: string,
    config: StartConfig,
    private adTimeoutMs: number,
  ) {
    this.currentConfig = config;
    this.currentLocale = config.locale;
    env.listen((data, messageOrigin, fromParent) => {
      if (fromParent && messageOrigin === origin) this.handle(data);
    });
  }

  get config(): StartConfig {
    return this.currentConfig;
  }

  get locale(): string {
    return this.currentLocale;
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    this.env.post({ type, ...payload }, this.origin);
  }

  private handle(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const msg = data as Record<string, unknown>;
    switch (msg.type) {
      case 'GHA_START':
        if (isStartConfig(msg.config)) this.currentConfig = msg.config;
        break;
      case 'GHA_PAUSE':
        this.pause.emit();
        break;
      case 'GHA_RESUME':
        this.resume.emit();
        break;
      case 'GHA_MUTE':
        if (typeof msg.muted === 'boolean') this.mute.emit(msg.muted);
        break;
      case 'GHA_THEME_CHANGE':
        if (typeof msg.theme === 'string' && isColorMode(msg.colorMode) && isTokenMap(msg.tokens)) {
          const info: ThemeInfo = {
            theme: msg.theme,
            colorMode: msg.colorMode,
            tokens: msg.tokens,
          };
          this.currentConfig = { ...this.currentConfig, ...info };
          this.theme.emit(info);
        }
        break;
      case 'GHA_LOCALE_CHANGE':
        if (typeof msg.locale === 'string') {
          this.currentLocale = msg.locale;
          this.localeChange.emit(msg.locale);
        }
        break;
      case 'GHA_AD_RESULT': {
        const settle = typeof msg.id === 'number' ? this.pendingAds.get(msg.id) : undefined;
        if (settle) settle(msg.rewarded === true, msg.shown === true);
        break;
      }
      default:
        break;
    }
  }

  private requestAd(format: 'rewarded' | 'interstitial', placement: string): Promise<boolean> {
    if (!this.currentConfig.adsEnabled) return Promise.resolve(false);
    const id = this.nextAdId++;
    return new Promise((resolve) => {
      const timer = this.env.setTimeout(() => finish(false), this.adTimeoutMs);
      const finish = (rewarded: boolean) => {
        this.env.clearTimeout(timer);
        this.pendingAds.delete(id);
        resolve(rewarded);
      };
      this.pendingAds.set(id, (rewarded) => finish(rewarded));
      this.send('GHA_AD_REQUEST', { id, format, placement });
    });
  }

  loadingProgress(progress: number): void {
    if (Number.isFinite(progress)) {
      this.send('GHA_LOADING', { progress: Math.min(1, Math.max(0, progress)) });
    }
  }

  gameplayStart(): void {
    this.send('GHA_SESSION_START');
  }

  gameplayStop(): void {
    this.send('GHA_GAMEPLAY_STOP');
  }

  submitScore(score: number): void {
    if (Number.isFinite(score)) this.send('GHA_SCORE', { score });
  }

  endGame(result: GameResult): void {
    const score =
      typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : null;
    this.send('GHA_END', { score, won: result.won, message: result.message });
  }

  async requestRewarded(placement: string): Promise<boolean> {
    return this.requestAd('rewarded', placement);
  }

  async requestInterstitial(placement: string): Promise<void> {
    await this.requestAd('interstitial', placement);
  }

  celebrate(): void {
    this.send('GHA_HAPPY_TIME');
  }

  openLeaderboard(): void {
    this.send('GHA_OPEN_LEADERBOARD');
  }

  onPause(callback: () => void): () => void {
    return this.pause.add(callback);
  }

  onResume(callback: () => void): () => void {
    return this.resume.add(callback);
  }

  onMute(callback: (muted: boolean) => void): () => void {
    return this.mute.add(callback);
  }

  onThemeChange(callback: (theme: ThemeInfo) => void): () => void {
    return this.theme.add(callback);
  }

  onLocaleChange(callback: (locale: string) => void): () => void {
    return this.localeChange.add(callback);
  }

  applyThemeTokens(target = this.env.rootStyle ? { style: this.env.rootStyle } : undefined): void {
    if (!target) return;
    for (const [name, value] of Object.entries(this.currentConfig.tokens)) {
      if (name.startsWith('--')) target.style.setProperty(name, value);
    }
  }
}

function isColorMode(value: unknown): value is ColorMode {
  return value === 'light' || value === 'dark';
}

function isTokenMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
  );
}

function isStartConfig(value: unknown): value is StartConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.locale === 'string' &&
    typeof c.theme === 'string' &&
    isColorMode(c.colorMode) &&
    isTokenMap(c.tokens) &&
    typeof c.adsEnabled === 'boolean'
  );
}

/**
 * Creates the adapter. Inside Ayvago it sends GHA_READY and waits for GHA_START; on any other
 * host (own URL, unknown parent, no answer) it resolves to the standalone adapter.
 */
export function createPlatformAdapter(options: AdapterOptions): Promise<PlatformAdapter> {
  const env = options.env ?? browserEnv();
  const patterns = options.platformOrigins ?? DEFAULT_PLATFORM_ORIGINS;
  const standalone = new StandaloneAdapter(env.language);
  const origin = env.parentOrigin;

  if (!env.embedded || !origin || !isAllowedPlatformOrigin(origin, patterns)) {
    return Promise.resolve(standalone);
  }

  return new Promise((resolve) => {
    let settled = false;
    const stop = env.listen((data, messageOrigin, fromParent) => {
      if (settled || !fromParent || messageOrigin !== origin) return;
      const msg = data as Record<string, unknown> | null;
      if (msg && msg.type === 'GHA_START' && isStartConfig(msg.config)) {
        settled = true;
        env.clearTimeout(timer);
        stop();
        resolve(new AyvagoAdapter(env, origin, msg.config, options.adTimeoutMs ?? 90_000));
      }
    });
    const timer = env.setTimeout(() => {
      if (settled) return;
      settled = true;
      stop();
      resolve(standalone);
    }, options.handshakeTimeoutMs ?? 3000);
    env.post({ type: 'GHA_READY', gameId: options.gameId, adapter: ADAPTER_VERSION }, origin);
  });
}
