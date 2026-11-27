import type { MusicChoice } from './music';
import type Phaser from 'phaser';
import type { Localized, Strings } from './i18n';
import type { MenuTheme } from './menu-theme';
import type { PadOverrides } from './gamepad-map';
import type { KeyHelpRow } from './key-help';

export type Genre = 'arcade' | 'action' | 'casual' | 'puzzle' | 'retro' | 'sports' | 'strategy' | 'card' | 'word';

/** Contents of games/<slug>/game.json — the platform catalogue reads this too. */
export interface GameMeta {
  id: string;
  title: Localized;
  description: Localized;
  howTo: Localized;
  genres: Genre[];
  /**
   * 'adaptive' (the default for new games): landscape 1280×720 on desktops and tablets, portrait
   * 720×1280 on phones, decided once at boot (isPhone, gameOrientation). 'portrait' / 'landscape'
   * fix the size for every device.
   */
  orientation: OrientationSetting;
  controls: Array<'touch' | 'keyboard' | 'mouse'>;
  version: string;
  credits?: string[];
  /**
   * Online play (core/net.ts): true = two-player rooms; a number (2 to 4) = a table with that many
   * seats in the platform's lobby (protocol 2.3). At three or four seats the host fills empty
   * seats with bots; two seats (Tavla) are a duel without bots, and a two-player game at a table
   * still plays in rooms reached through an old room link.
   */
  multiplayer?: boolean | number;
}

export interface GameDefinition {
  meta: GameMeta;
  /** Letterbox + menu background colour. */
  background?: string;
  /** Crisp nearest-neighbour scaling for tiny pixel-art packs. */
  pixelArt?: boolean;
  physics?: 'arcade' | 'matter' | 'none';
  gravityY?: number;
  /** Scanline overlay (default on in the retro style; the modern style never has it). */
  crt?: boolean;
  /**
   * Look of the core UI (src/core/style.ts): 'retro' (pixel fonts, scanlines, chunky buttons) or
   * 'modern' (rounded fonts, smooth scaling, soft UI). Default: retro for games in the retro
   * genre, modern for every other game.
   */
  style?: 'retro' | 'modern';
  /** Load the game's assets (runs while the Ayvago intro plays). */
  preload: (scene: Phaser.Scene) => void;
  /** Game scenes; one of them must use the key 'Play' (usually an ArcadeScene). */
  scenes: Array<new (...args: any[]) => Phaser.Scene>;
  /** Extra i18n keys for t(). */
  strings?: Partial<Strings>;
  /**
   * Background music (src/core/music.ts). Defaults: the title theme on the menu and a track
   * picked from the game's genre during rounds; `false` turns a slot off. A slot may also name
   * the game's own file (`{ file: 'music/owner/….mp3', gain? }`, see MusicFile).
   */
  music?: { menu?: MusicChoice | false; play?: MusicChoice | false };
  /**
   * Offers Easy / Normal (src/core/difficulty.ts): the menu shows the toggle in solo play, the
   * game reads `isEasy()` in createGame(), and GHA_END reports the difficulty. Easy runs are
   * practice (off the leaderboards, no local best). For AI opponents and action games only.
   */
  difficulty?: boolean;
  /** Optional decoration for the menu (sprites behind the title). */
  menuDecor?: (scene: Phaser.Scene) => void;
  /**
   * The game's own menu look (src/core/menu-theme.ts): palette, display font, a logo drawn from
   * the title with an emblem, a skin for the buttons, switches and plates, and a frame. The layout
   * stays the core's; without a theme the menu looks as it always has. Its logo also goes on the
   * store art (scripts/gen-store-assets.mjs).
   */
  menuTheme?: MenuTheme;
  /**
   * A game's own setting on the menu (e.g. the driving games' `steeringOption`), drawn by `build` in the
   * slot the Easy/Normal switch uses: beside PLAY in landscape, under it in portrait. `show`
   * decides per device (e.g. touch screens only). With `difficulty` as well, the two are stacked
   * (difficulty first): under PLAY in portrait, right of PLAY in landscape.
   */
  menuOption?: { show?: (scene: Phaser.Scene) => boolean; build: (scene: Phaser.Scene, x: number, y: number) => void };
  /**
   * Rewarded ads on the result screen (src/core/ads.ts), offered only while the platform has ads
   * on, never online. Always the player's choice; never during play.
   */
  ads?: AdsOptions;
  /**
   * The game's own gamepad keys during play (src/core/gamepad.ts): a control mapped to another
   * key (`KeyboardEvent.code`), or null to turn it off. Menus, the pause and the game's own
   * overlays (pushModal) keep the core mapping. Without it the defaults in gamepad-map.ts apply.
   */
  gamepad?: PadOverrides;
  /**
   * The keyboard controls as key caps (src/core/key-help.ts), desktop only: a strip along the
   * bottom of the pause screen, and the card the game opens once with showKeyHelp().
   */
  keyHelp?: KeyHelpRow[];
}

/** The result of a finished run, as the result screen shows it. */
export interface RunOutcome {
  score: number;
  win: boolean;
}

export interface AdsOptions {
  /**
   * 'continue': a lost run may go on once after a rewarded ad. The core resumes the Play scene
   * (isOver false, physics on, music back) and calls this to bring the run back: one extra life,
   * the player moved to safety, a short invulnerability. Same score session; GHA_END is sent when
   * the player turns the offer down or the continued run ends, with `continues: 1`.
   */
  continue?: (play: Phaser.Scene) => void;
  /** Optional: whether this lost run may continue at all (default: every lost run). */
  canContinue?: (play: Phaser.Scene) => boolean;
  /**
   * '2× reward': for a game with a currency kept between runs (coins, XP). `grant` adds the run's
   * currency once more; it must never touch the score (the leaderboard number). `show` decides
   * per run (e.g. only when something was earned). On a lost run with a continue offer the
   * continue takes the slot.
   */
  double?: { grant: (scene: Phaser.Scene, run: RunOutcome) => void; show?: (run: RunOutcome) => boolean };
}

// ------------------------------------------------------------------ orientation

export type Orientation = 'portrait' | 'landscape';
/** game.json `orientation`: a fixed one, or 'adaptive' (the platform manifest says 'any'). */
export type OrientationSetting = Orientation | 'adaptive';

/**
 * Whether the device is a phone. The contract with ayvago.com (the platform frames an 'any' game
 * by the same rule): a touch-first device (no hover, coarse pointer) whose screen's short side is
 * under 600 CSS px. Tablets (iPad, Android tablets) and desktops are not phones.
 */
export function isPhone(): boolean {
  try {
    if (typeof matchMedia !== 'function' || typeof screen === 'undefined') return false;
    return matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
  } catch {
    return false;
  }
}

/** `?orient=portrait|landscape` forces an adaptive game's orientation (tests, store art, debugging). */
function orientOverride(): Orientation | null {
  try {
    const v = new URLSearchParams(location.search).get('orient');
    return v === 'portrait' || v === 'landscape' ? v : null;
  } catch {
    return null;
  }
}

/** The orientation a game runs in on this device: fixed games keep theirs; adaptive games follow isPhone(). */
export function resolveOrientation(setting: OrientationSetting): Orientation {
  if (setting === 'portrait' || setting === 'landscape') return setting;
  return orientOverride() ?? (isPhone() ? 'portrait' : 'landscape');
}

let current: GameDefinition | null = null;
let resolved: Orientation = 'portrait';

export function setCurrentGame(def: GameDefinition): void {
  current = def;
  // decided once at boot: the game never switches orientation mid-session
  resolved = resolveOrientation(def.meta.orientation);
}

/**
 * The orientation the running game was given (portrait 720×1280 or landscape 1280×720). Every
 * layout decision reads this (or isLandscape), never `meta.orientation`, which may be 'adaptive'.
 */
export function gameOrientation(): Orientation {
  return resolved;
}

export function isLandscape(): boolean {
  return resolved === 'landscape';
}

/** Whether the running game is adaptive (its layout must work in both orientations). */
export function isAdaptive(): boolean {
  return current?.meta.orientation === 'adaptive';
}

export function currentGame(): GameDefinition {
  if (!current) throw new Error('No game launched');
  return current;
}

export function gameSize(def: GameDefinition): { width: number; height: number } {
  const o = def === current ? resolved : resolveOrientation(def.meta.orientation);
  return o === 'landscape' ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
}
