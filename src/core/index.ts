// @core — shared Ayvago game runtime. Games import everything from here.
export { default as Phaser } from 'phaser';
export { launch } from './launch';
export { ArcadeScene } from './ArcadeScene';
export type { EndOptions } from './ArcadeScene';
export { Controls } from './controls';
export type { ControlsOptions } from './controls';
export { StickDir } from './stick';
export type { Dir4 } from './stick';
export { Button, Hud, HudChip, hudChip, hudText, iconButton, backdrop, HUD_CHIP_H, HUD_ROW_Y, HUD_ROW2_Y, HUD_MARGIN, HUD_GAP, hudRightEdge } from './ui';
export type { HudChipOptions, HudChipAlign } from './ui';
export { txt, COLORS, hex, FONT_TITLE, FONT_BODY } from './theme';
export { burst, shake, flash, popup, addCrt, ensurePixel } from './fx';
export { asset, kenney, loadAudio, loadSfx, ASSET_ROOT } from './assets';
export { playSfx, isMuted, type SfxConfig } from './audio';
export { playMusic, stopMusic, duckMusic, restoreMusic, TRACKS, type Track } from './music';
export { t, loc, upper, getLang, registerStrings } from './i18n';
export type { Lang, Strings, Localized } from './i18n';
export { storage, getBest } from './storage';
export { sdk } from './sdk';
export { difficulty, isEasy, setDifficulty, offersDifficulty } from './difficulty';
export type { Difficulty } from './difficulty';
export { net } from './net';
export {
  CHARACTER_IDS, CHARACTER_POSES, CHARACTER_PARTS, CHARACTER_FRAME, DEFAULT_CHARACTER,
  isCharacterId, playerCharacter, peerCharacter, otherCharacters, characterUrl, characterRig, loadCharacter,
} from './characters';
export type { CharacterId, CharacterPose, CharacterPart, CharacterRig } from './characters';
export type { NetHandler } from './net';
export type { TableSettings } from './ayvago/adapter';
export { playAyvagoIntro, INTRO_DURATION } from './intro';
export type { GameDefinition, GameMeta, Genre } from './registry';
export { currentGame } from './registry';
export * as rng from './rng';
export { quickChat, loadQuickChat, phraseText, phraseOf, QUICK_PHRASES, QUICK_CHAT_COOLDOWN } from './quickchat';
export type { QuickChat, QuickChatOptions, QuickPhrase, SeatAnchor } from './quickchat';
export { openPlayerCard, closePlayerCard, isPlayerCardOpen, avatar, portraitKey, characterName, lifetimeStats, lifetimeRows, recordMatch } from './playercard';
export type { PlayerCardInfo, StatRow, LifetimeStats } from './playercard';
export { isModalOpen, pushModal } from './modal';
export {
  CarSteering, CarPad, Tilt, tilt, TILT_FULL_LOCK, STEER_MODES, steerMode, setSteerMode, touchScreen, steeringMenu, steeringOption,
  RAMP_TIME, WHEEL_LOCK, STEER_CURVE, steerCurve,
} from './steering';
export type { SteerMode, TiltResult, CarPadButton, CarPadOptions, CarSteeringOptions } from './steering';
