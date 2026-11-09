import type { Track } from './music';
import type Phaser from 'phaser';
import type { Localized, Strings } from './i18n';

export type Genre = 'arcade' | 'action' | 'casual' | 'puzzle' | 'retro' | 'sports' | 'strategy' | 'card' | 'word';

/** Contents of games/<slug>/game.json — the platform catalogue reads this too. */
export interface GameMeta {
  id: string;
  title: Localized;
  description: Localized;
  howTo: Localized;
  genres: Genre[];
  orientation: 'portrait' | 'landscape';
  controls: Array<'touch' | 'keyboard' | 'mouse'>;
  version: string;
  credits?: string[];
  /**
   * Online play (core/net.ts): true = two-player rooms; a number (3 or 4) = a table with that many
   * seats where the host fills empty seats with bots (protocol 2.3).
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
   * picked from the game's genre during rounds; `false` turns a slot off.
   */
  music?: { menu?: Track | false; play?: Track | false };
  /**
   * Offers Easy / Normal (src/core/difficulty.ts): the menu shows the toggle in solo play, the
   * game reads `isEasy()` in createGame(), and GHA_END reports the difficulty. Easy runs are
   * practice (off the leaderboards, no local best). For AI opponents and action games only.
   */
  difficulty?: boolean;
  /** Optional decoration for the menu (sprites behind the title). */
  menuDecor?: (scene: Phaser.Scene) => void;
  /**
   * A game's own setting on the menu (e.g. Mud Rally's steering choice), drawn by `build` in the
   * slot the Easy/Normal switch uses: beside PLAY in landscape, under it in portrait. `show`
   * decides per device (e.g. touch screens only). Not offered together with `difficulty`.
   */
  menuOption?: { show?: (scene: Phaser.Scene) => boolean; build: (scene: Phaser.Scene, x: number, y: number) => void };
}

let current: GameDefinition | null = null;

export function setCurrentGame(def: GameDefinition): void {
  current = def;
}

export function currentGame(): GameDefinition {
  if (!current) throw new Error('No game launched');
  return current;
}

export function gameSize(def: GameDefinition): { width: number; height: number } {
  return def.meta.orientation === 'landscape' ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
}
