// Tilt control for the maze board: both axes of the phone's tilt (deviceorientation), with the
// same permission flow as the core's car tilt (src/core/steering/tilt.ts): iOS asks once and only
// from a tap, the reading follows the screen orientation, a dead zone and a calibration take the
// way the phone is held as level. The core reader gives one sideways value for steering; a board
// needs forward/back as well, so this game keeps its own small reader (the core stays untouched).
//
// The menu switch CONTROL: STICK | TILT (touch screens only) is the game's `menuOption`.
import Phaser from 'phaser';
import { t, txt, popup, storage, playSfx, touchScreen, type TiltResult } from '@core';

/** Degrees ignored around level, and the tilt that gives full board tilt. */
const DEADZONE = 2;
export const TILT_FULL = 20;
/** The calibrated "level" never strays further than this from flat / upright. */
const MAX_SIDE = 18;
const MIN_PITCH = 0;
const MAX_PITCH = 70;

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

export class BoardTilt {
  active = false;
  /** Smoothed board input, -1..1: x > 0 rolls right, y < 0 rolls up the screen (away). */
  x = 0;
  y = 0;
  fullLock = TILT_FULL;
  /** Raw angles (degrees) from the last reading: sideways and pitch (0 flat, 90 upright). */
  side = 0;
  pitch = 40;
  private nSide = 0;
  private nPitch = 40;
  private fresh = false;
  private listener = (e: DeviceOrientationEvent) => this.onOrientation(e);

  static get available(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Starts the sensors (call from a tap on iOS). Resolves once readings arrive, or why not. */
  async enable(): Promise<TiltResult> {
    if (!BoardTilt.available) return 'unsupported';
    if (this.active) return 'on';
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    if (typeof api.requestPermission === 'function') {
      try {
        if ((await api.requestPermission()) !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }
    window.addEventListener('deviceorientation', this.listener);
    const got = await new Promise<boolean>((resolve) => {
      const t0 = Date.now();
      const check = () => {
        if (this.fresh) resolve(true);
        else if (Date.now() - t0 > 1500) resolve(false);
        else setTimeout(check, 50);
      };
      check();
    });
    if (!got) {
      this.disable();
      return 'unsupported';
    }
    this.active = true;
    this.calibrate();
    return 'on';
  }

  disable(): void {
    window.removeEventListener('deviceorientation', this.listener);
    this.active = false;
    this.fresh = false;
    this.x = this.y = 0;
  }

  /** The way the phone is held now counts as a level board (within a sane range). */
  calibrate(): void {
    this.nSide = Math.max(-MAX_SIDE, Math.min(MAX_SIDE, this.side));
    this.nPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
    this.x = this.y = 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    const shape = (d: number) => {
      const s = Math.sign(d);
      const m = Math.min(1, Math.max(0, Math.abs(d) - DEADZONE) / (this.fullLock - DEADZONE));
      return s * Math.pow(m, 1.15);
    };
    const wx = shape(this.side - this.nSide), wy = shape(this.pitch - this.nPitch);
    const k = Math.min(1, dt * 14);
    this.x += (wx - this.x) * k;
    this.y += (wy - this.y) * k;
  }

  private onOrientation(e: DeviceOrientationEvent): void {
    if (e.beta === null || e.gamma === null) return;
    this.fresh = true;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    // "up" in the phone's axes (x right, y to the top edge, z out of the screen)
    const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    // into the screen's axes as the player sees them (landscape turns the phone a quarter)
    const o = ((screenAngle() % 360) + 360) % 360;
    const r = (o * Math.PI) / 180;
    const sx = ux * Math.cos(r) - uy * Math.sin(r);
    const sy = ux * Math.sin(r) + uy * Math.cos(r);
    // the right edge dipping tips "up" towards the screen's left; the top edge dipping lowers the pitch
    this.side = (Math.asin(Math.max(-1, Math.min(1, -sx))) * 180) / Math.PI;
    this.pitch = (Math.atan2(sy, uz) * 180) / Math.PI;
  }
}

function screenAngle(): number {
  const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** One reader for the page: the menu turns it on from a tap, the levels read it. */
export const boardTilt = new BoardTilt();

// ---------------------------------------------------------------- the menu switch

export type ControlMode = 'stick' | 'tilt';
const MODES: ControlMode[] = ['stick', 'tilt'];
const KEY = 'marble-maze:control';

export function controlMode(): ControlMode {
  return storage.get<string>(KEY, 'stick') === 'tilt' ? 'tilt' : 'stick';
}

export function setControlMode(m: ControlMode): void {
  storage.set(KEY, m);
}

const SEG = 170;
const H = 84;

function drawIcon(g: Phaser.GameObjects.Graphics, m: ControlMode, color: number): void {
  g.clear().lineStyle(4, color, 1).fillStyle(color, 1);
  if (m === 'stick') g.strokeCircle(0, 0, 14).fillCircle(4, -3, 7);
  else g.strokeRoundedRect(-8, -14, 16, 28, 4).fillCircle(0, 9, 2);
}

/** CONTROL: STICK | TILT, centred on (x, y). Choosing TILT asks for the sensors inside the tap. */
export function controlMenu(scene: Phaser.Scene, x: number, y0: number): void {
  const y = y0 + 26;
  const W = SEG * MODES.length;
  let mode = controlMode();
  const left = x - W / 2;
  const segX = (i: number) => left + SEG * i + SEG / 2;
  txt(scene, x, y - H / 2 - 22, t('ctrlTitle'), { title: true, size: 18, color: '#ffd23f' });
  scene.add.graphics()
    .fillStyle(0x000000, 0.28).fillRoundedRect(left, y - H / 2 + 6, W, H, 22)
    .fillStyle(0x0b1020, 0.72).fillRoundedRect(left, y - H / 2, W, H, 22)
    .lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(left, y - H / 2, W, H, 22);
  const knob = scene.add.graphics().fillStyle(0xffd23f, 1).fillRoundedRect(-SEG / 2 + 6, -H / 2 + 6, SEG - 12, H - 12, 18);
  knob.setPosition(segX(MODES.indexOf(mode)), y);
  const parts = MODES.map((m, i) => ({
    ic: scene.add.graphics().setPosition(segX(i), y - 14).setAngle(m === 'tilt' ? -22 : 0),
    lb: txt(scene, segX(i), y + 22, t(`ctrl_${m}`), { title: true, size: 17, color: '#ffffff', strokeThickness: 4 }),
  }));
  for (const p of parts) if (p.lb.width > SEG - 12) p.lb.setScale((SEG - 12) / p.lb.width);
  const paint = () => MODES.forEach((m, i) => {
    const on = m === mode;
    drawIcon(parts[i].ic, m, on ? 0x1a1320 : 0xffffff);
    parts[i].lb.setColor(on ? '#1a1320' : '#ffffff').setStroke('#000000', on ? 0 : 4).setShadowFill(!on).setShadowStroke(!on);
  });
  paint();
  const choose = (m: ControlMode) => {
    mode = m;
    setControlMode(m);
    scene.tweens.add({ targets: knob, x: segX(MODES.indexOf(m)), duration: 160, ease: 'Quad.easeOut' });
    paint();
    playSfx(scene, 'ui-click');
  };
  MODES.forEach((m, i) => {
    const zone = scene.add.zone(segX(i), y, SEG, H + 10).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (m === mode) return;
      if (m === 'stick') {
        boardTilt.disable();
        choose(m);
        return;
      }
      // from inside the tap: iOS shows its permission prompt only now
      void boardTilt.enable().then((r) => {
        if (!scene.sys.isActive()) return;
        if (r === 'on') choose('tilt');
        else popup(scene, x, y + H / 2 + 30, t(r === 'denied' ? 'tiltDenied' : 'tiltNone'), '#ff9a7a', 22);
      });
    });
  });
}

/** The game's menu slot: `menuOption: controlOption` (touch screens only). */
export const controlOption = { show: touchScreen, build: controlMenu };
