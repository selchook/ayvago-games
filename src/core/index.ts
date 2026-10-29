// @core — shared Ayvago game runtime. Games import everything from here.
export { default as Phaser } from 'phaser';
export { launch } from './launch';
export { ArcadeScene } from './ArcadeScene';
export type { EndOptions } from './ArcadeScene';
export { Controls } from './controls';
export type { ControlsOptions } from './controls';
export { Button, Hud, iconButton, backdrop } from './ui';
export { txt, COLORS, hex, FONT_TITLE, FONT_BODY } from './theme';
export { burst, shake, flash, popup, addCrt, ensurePixel } from './fx';
export { asset, kenney, loadAudio, loadSfx, ASSET_ROOT } from './assets';
export { playSfx, isMuted, type SfxConfig } from './audio';
export { playMusic, stopMusic, duckMusic, restoreMusic, TRACKS, type Track } from './music';
export { t, loc, upper, getLang, registerStrings } from './i18n';
export type { Lang, Strings, Localized } from './i18n';
export { storage, getBest } from './storage';
export { sdk } from './sdk';
export { net } from './net';
export {
  CHARACTER_IDS, CHARACTER_POSES, CHARACTER_PARTS, CHARACTER_FRAME, DEFAULT_CHARACTER,
  isCharacterId, playerCharacter, peerCharacter, otherCharacters, characterUrl, characterRig, loadCharacter,
} from './characters';
export type { CharacterId, CharacterPose, CharacterPart, CharacterRig } from './characters';
export type { NetHandler } from './net';
export { playAyvagoIntro, INTRO_DURATION } from './intro';
export type { GameDefinition, GameMeta, Genre } from './registry';
export { currentGame } from './registry';
export * as rng from './rng';
