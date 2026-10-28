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
  /** Supports online two-player matches (core/net.ts); the platform lists it as multiplayer. */
  multiplayer?: boolean;
}

export interface GameDefinition {
  meta: GameMeta;
  /** Letterbox + menu background colour. */
  background?: string;
  /** Crisp nearest-neighbour scaling for tiny pixel-art packs. */
  pixelArt?: boolean;
  physics?: 'arcade' | 'matter' | 'none';
  gravityY?: number;
  /** Scanline overlay (default on). */
  crt?: boolean;
  /** Load the game's assets (runs while the Ayvago intro plays). */
  preload: (scene: Phaser.Scene) => void;
  /** Game scenes; one of them must use the key 'Play' (usually an ArcadeScene). */
  scenes: Array<new (...args: any[]) => Phaser.Scene>;
  /** Extra i18n keys for t(). */
  strings?: Partial<Strings>;
  /** Optional decoration for the menu (sprites behind the title). */
  menuDecor?: (scene: Phaser.Scene) => void;
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
