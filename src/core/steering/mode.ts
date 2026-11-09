// How the player steers a car on a touch screen: arrow buttons, an on-screen steering wheel
// turned with the thumb, or tilting the phone. One choice for every driving game (the key is
// shared, so a player who picks TILT in one car game finds it in the next). Keyboards always steer
// with the arrow keys as well.
import Phaser from 'phaser';
import { storage } from '../storage';

export type SteerMode = 'arrows' | 'wheel' | 'tilt';

export const STEER_MODES: readonly SteerMode[] = ['arrows', 'wheel', 'tilt'];

const KEY = 'steer';
/** Mud Rally kept the choice under its own keys before the steering moved into the core. */
const LEGACY_KEY = 'mud-rally:steer';
const LEGACY_TILT_KEY = 'mud-rally:tilt';

const isMode = (v: unknown): v is SteerMode => (STEER_MODES as readonly unknown[]).includes(v);

export function steerMode(): SteerMode {
  const v = storage.get<string>(KEY, '');
  if (isMode(v)) return v;
  const old = storage.get<string>(LEGACY_KEY, '');
  if (isMode(old)) return old;
  return storage.get<boolean>(LEGACY_TILT_KEY, false) ? 'tilt' : 'arrows';
}

export function setSteerMode(m: SteerMode): void {
  storage.set(KEY, m);
}

/** The choice only matters on touch screens. */
export const touchScreen = (scene: Phaser.Scene): boolean => scene.sys.game.device.input.touch;
