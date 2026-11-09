/**
 * Ayvago platform adapter (protocol 2, v1-compatible GHA_* messages).
 *
 * Minor protocol versions add optional fields and messages only: 2.1 online rooms, 2.2 the player's
 * character, 2.3 tables of up to four seats, 2.4 the player's server best (`config.best`), 2.5 the
 * game's own sound switch reported to the platform (`reportMute`, GHA_MUTE_STATE), 2.6 the run's
 * difficulty in GHA_END (`difficulty: 'easy'` runs are practice and stay off the leaderboards),
 * 2.7 table settings and the host's seat (`config.table`) and host hand-over (GHA_HOST_CHANGE).
 *
 * A single, dependency-free file that games vendor (copy) into their own repository. At runtime
 * it decides whether the game runs inside Ayvago (embedded in an iframe on an allowed platform
 * origin that answers the handshake) or standalone (its own URL), and exposes the same API in
 * both cases so a game ships one build.
 *
 * Source of truth: selchook/ayvago, packages/platform-adapter/src/adapter.ts.
 * Update vendored copies by copying this file; do not edit them in place.
 */

export const ADAPTER_VERSION = '2.7.0';
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

/** Protocol 2.3: one seat at a table game (up to four players, empty seats taken by bots). */
export type SeatInfo = {
  /** Display name: the player's name, or the bot's name chosen by the platform. */
  name: string;
  /** The seat's character id, when its player chose one (never set for bots). */
  character?: string;
  /** A bot seat: the host's game plays it. */
  bot: boolean;
};

/** Protocol 2.7: what the host chose when opening the table. */
export type TableSettings = {
  /** Hands (rounds) per match: 5 or 11. */
  hands: number;
  /** Seconds a player has for a turn: 15 (fast), 30 (normal) or 60 (relaxed). */
  turnSeconds: number;
  /** Empty seats may be bots. False: every seat was taken by a player when the game started. */
  bots: boolean;
};

/** Protocol 2.7, table games only: the table's settings and who hosts it now. */
export type TableConfig = {
  settings: TableSettings;
  /**
   * The host's seat. 0 when the table starts; after a hand-over (GHA_HOST_CHANGE) another seat.
   * The host's game plays the bot seats and resyncs players who come back.
   */
  hostSeat: number;
};

export type StartConfig = ThemeInfo & {
  mode: 'solo' | 'multiplayer';
  isHost: boolean;
  playerIndex: number;
  playerCount: number;
  /** Multiplayer only: the other player's display name. */
  peerName?: string;
  /**
   * Protocol 2.2: the player's chosen character (an id from the platform's character list, e.g.
   * "adventurer"). Absent for players who have not chosen one; games then use their default.
   */
  character?: string;
  /** Protocol 2.2, multiplayer only: the other player's character. */
  peerCharacter?: string;
  /**
   * Protocol 2.3, table games only: every seat in order (`playerCount` entries; this player sits
   * at `playerIndex`, the host at 0). Two-player rooms leave it out.
   */
  seats?: SeatInfo[];
  /**
   * Protocol 2.7, table games only: settings and the host's seat. Absent in two-player rooms,
   * solo runs and on platforms before 2.7 (then: host at seat 0, the game's own defaults).
   */
  table?: TableConfig;
  /**
   * Protocol 2.4: the player's best score for this game on the platform (its leaderboard order:
   * the lowest for games where lower is better). `null`: the player has no recorded score yet,
   * so any finished run is their first. Absent: the platform does not know (signed out of
   * Firebase, slow or failed read); the game keeps its own stored best.
   */
  best?: number | null;
  locale: string;
  adsEnabled: boolean;
  protocol: number;
};

/** Protocol 2.6: the difficulty a run was played at. Easy runs are practice (no leaderboard). */
export type Difficulty = 'easy' | 'normal';

export type GameResult = {
  score?: number;
  won?: boolean;
  message?: string;
  difficulty?: Difficulty;
};

/** Largest move payload (serialized JSON, in characters); larger moves are dropped. */
export const MAX_MOVE_SIZE = 16_000;

/**
 * Online play. Two-player rooms (protocol 2.1) and, since protocol 2.3, tables of up to four
 * seats where the host fills empty seats with bots. The platform owns the room and the
 * connection; the game only exchanges moves.
 * Messages: GHA_MOVE_OUT { data } game → platform (sent to every other player),
 * GHA_MOVE_IN { data, from? } platform → game, GHA_PEER_LEAVE { seat? } / GHA_PEER_JOIN
 * { name, seat? } when a player drops out or comes back. `from` and `seat` are seat indexes;
 * two-player rooms leave them out and mean the other player. Protocol 2.7: GHA_HOST_CHANGE
 * { hostSeat } platform → game when another player took over as the table's host.
 */
export interface Multiplayer {
  /** True when the platform started this game for an online match. */
  readonly active: boolean;
  /**
   * The room creator; by convention the host runs authoritative simulations (and, at a table,
   * plays the bots). At a table it follows hand-overs: true once this player's seat is `hostSeat`.
   */
  readonly isHost: boolean;
  /** Protocol 2.7: the host's seat (0 in two-player rooms, offline and before any hand-over). */
  readonly hostSeat: number;
  /** Protocol 2.7, table games: the settings and host seat; null in rooms, solo and offline. */
  readonly table: TableConfig | null;
  /** This player's seat: 0 for the host, 1 for the guest (up to 3 at a table). */
  readonly playerIndex: number;
  /** Protocol 2.3, table games: every seat in order; empty in two-player rooms and offline. */
  readonly seats: readonly SeatInfo[];
  /** The other player's display name ('' when unknown). */
  readonly peerName: string;
  /** The other player's character id ('' when unknown, protocol 2.2). */
  readonly peerCharacter: string;
  /** Sends a JSON-serializable move to the other players (dropped above MAX_MOVE_SIZE). */
  send(data: unknown): void;
  /** A move from another player; `from` is the sender's seat. */
  onMove(callback: (data: unknown, from: number) => void): () => void;
  /** A player dropped out; `seat` is their seat. */
  onPeerLeave(callback: (seat: number) => void): () => void;
  /** A player came back (or took a seat); `seat` is their seat. */
  onPeerJoin(callback: (name: string, seat: number) => void): () => void;
  /**
   * Protocol 2.7, table games: the host left and the player in `hostSeat` took over. `isHost`
   * and `hostSeat` already have the new values when the callback runs.
   */
  onHostChange(callback: (hostSeat: number) => void): () => void;
}

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
  /**
   * Protocol 2.5: the game's own sound switch (its menu button) changed, or its state at start.
   * The platform shows the same state on its sound button, so the two never disagree.
   */
  reportMute(muted: boolean): void;
  openLeaderboard(): void;
  onPause(callback: () => void): () => void;
  onResume(callback: () => void): () => void;
  onMute(callback: (muted: boolean) => void): () => void;
  onThemeChange(callback: (theme: ThemeInfo) => void): () => void;
  onLocaleChange(callback: (locale: string) => void): () => void;
  /** Writes the platform theme tokens as CSS custom properties (default: <html>). */
  applyThemeTokens(target?: { style: { setProperty(name: string, value: string): void } }): void;
  /** Online two-player play; inactive in solo runs and standalone. */
  readonly multiplayer: Multiplayer;
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

const OFFLINE: Multiplayer = {
  active: false,
  isHost: true,
  hostSeat: 0,
  table: null,
  playerIndex: 0,
  peerName: '',
  peerCharacter: '',
  seats: [],
  send: () => {},
  onMove: () => () => {},
  onPeerLeave: () => () => {},
  onPeerJoin: () => () => {},
  onHostChange: () => () => {},
};

function moveFits(data: unknown): boolean {
  try {
    const json = JSON.stringify(data);
    return json !== undefined && json.length <= MAX_MOVE_SIZE;
  } catch {
    return false;
  }
}

class StandaloneAdapter implements PlatformAdapter {
  readonly name = 'standalone' as const;
  readonly config = null;
  readonly multiplayer = OFFLINE;

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
  reportMute(): void {}
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
  private moveIn = new Emitter<[unknown, number]>();
  private peerLeave = new Emitter<number>();
  private peerJoin = new Emitter<[string, number]>();
  private hostChange = new Emitter<number>();
  readonly multiplayer: Multiplayer;

  constructor(
    private env: HostEnv,
    private origin: string,
    config: StartConfig,
    private adTimeoutMs: number,
  ) {
    this.currentConfig = withTable(withBest(config));
    this.currentLocale = config.locale;
    const self = this;
    this.multiplayer = {
      get active() {
        return self.currentConfig.mode === 'multiplayer';
      },
      get isHost() {
        return self.currentConfig.isHost;
      },
      get hostSeat() {
        return self.currentConfig.table?.hostSeat ?? 0;
      },
      get table() {
        return self.currentConfig.table ?? null;
      },
      get playerIndex() {
        return self.currentConfig.playerIndex;
      },
      get peerName() {
        return self.currentConfig.peerName ?? '';
      },
      get peerCharacter() {
        return self.currentConfig.peerCharacter ?? '';
      },
      get seats() {
        return self.currentConfig.seats ?? [];
      },
      send: (data: unknown) => {
        if (self.currentConfig.mode !== 'multiplayer') return;
        if (moveFits(data)) self.send('GHA_MOVE_OUT', { data });
        else console.warn('[ayvago] move dropped: not JSON or larger than', MAX_MOVE_SIZE);
      },
      onMove: (callback) => self.moveIn.add(([data, from]) => callback(data, from)),
      onPeerLeave: (callback) => self.peerLeave.add(callback),
      onPeerJoin: (callback) => self.peerJoin.add(([name, seat]) => callback(name, seat)),
      onHostChange: (callback) => self.hostChange.add(callback),
    };
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

  /** A seat index from the platform; two-player rooms send none, which means the other player. */
  private seatOf(value: unknown): number {
    const count = Math.max(2, this.currentConfig.playerCount);
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count
      ? value
      : 1 - Math.min(1, this.currentConfig.playerIndex);
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    this.env.post({ type, ...payload }, this.origin);
  }

  private handle(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const msg = data as Record<string, unknown>;
    switch (msg.type) {
      case 'GHA_START':
        if (isStartConfig(msg.config)) this.currentConfig = withTable(withBest(msg.config));
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
      case 'GHA_MOVE_IN':
        if ('data' in msg) this.moveIn.emit([msg.data, this.seatOf(msg.from)]);
        break;
      case 'GHA_PEER_LEAVE':
        this.peerLeave.emit(this.seatOf(msg.seat));
        break;
      case 'GHA_PEER_JOIN':
        this.peerJoin.emit([typeof msg.name === 'string' ? msg.name : '', this.seatOf(msg.seat)]);
        break;
      case 'GHA_HOST_CHANGE': {
        // Tables only; a seat outside the table or no change is ignored.
        const table = this.currentConfig.table;
        const seat = msg.hostSeat;
        if (!table || !isSeatIndex(seat, this.currentConfig.playerCount)) break;
        if (seat === table.hostSeat) break;
        this.currentConfig = {
          ...this.currentConfig,
          isHost: seat === this.currentConfig.playerIndex,
          table: { ...table, hostSeat: seat },
        };
        this.hostChange.emit(seat);
        break;
      }
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
    const end: Record<string, unknown> = { score, won: result.won, message: result.message };
    // only a valid value is sent; games that do not offer difficulty send nothing (normal)
    if (result.difficulty === 'easy' || result.difficulty === 'normal')
      end.difficulty = result.difficulty;
    this.send('GHA_END', end);
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

  reportMute(muted: boolean): void {
    this.send('GHA_MUTE_STATE', { muted: !!muted });
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

/** Protocol 2.4: keeps `best` only as a finite number or null; anything else means unknown. */
function withBest(config: StartConfig): StartConfig {
  const best: unknown = config.best;
  if (best === null || (typeof best === 'number' && Number.isFinite(best))) return config;
  const rest = { ...config };
  delete rest.best;
  return rest;
}

function isSeatIndex(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
}

/**
 * Protocol 2.7: keeps `table` only when it is well formed (settings with a number of hands, turn
 * seconds and bots, and a host seat inside the table); anything else is dropped, as if absent.
 */
function withTable(config: StartConfig): StartConfig {
  const table: unknown = config.table;
  if (table === undefined) return config;
  const t = table as { settings?: Record<string, unknown> | null; hostSeat?: unknown } | null;
  const s = t?.settings;
  const valid =
    !!s &&
    typeof s.hands === 'number' &&
    Number.isInteger(s.hands) &&
    s.hands > 0 &&
    typeof s.turnSeconds === 'number' &&
    Number.isFinite(s.turnSeconds) &&
    s.turnSeconds > 0 &&
    typeof s.bots === 'boolean' &&
    isSeatIndex(t?.hostSeat, config.playerCount);
  if (valid) return config;
  const rest = { ...config };
  delete rest.table;
  return rest;
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
