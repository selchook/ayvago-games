// Steering for driving games (2D or 3D): the menu's ARROWS | WHEEL | TILT switch, the touch pad
// and the per-race glue. Plain Phaser UI, exported from '@core'. Rules: new-game skill §7d.
export { Tilt, tilt, TILT_FULL_LOCK, type TiltResult } from './tilt';
export { STEER_MODES, steerMode, setSteerMode, touchScreen, type SteerMode } from './mode';
export { steeringMenu, steeringOption } from './menu';
export { CarPad, WHEEL_LOCK, type CarPadButton, type CarPadOptions } from './pad';
export { CarSteering, RAMP_TIME, type CarSteeringOptions } from './steering';
export { steerCurve, STEER_CURVE } from './curve';
