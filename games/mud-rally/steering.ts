// How the player steers on a touch screen, chosen on the menu: arrow buttons, an on-screen
// steering wheel turned with the thumb, or tilting the phone. Kept between visits. Keyboards
// always steer with the arrow keys as well.
import { Phaser, popup, storage, t, txt } from '@core';
import { tilt } from './tilt';

export type SteerMode = 'arrows' | 'wheel' | 'tilt';

const KEY = 'mud-rally:steer';
/** The earlier on/off tilt switch, read once so a player who had tilt on keeps it. */
const OLD_TILT_KEY = 'mud-rally:tilt';
const MODES: SteerMode[] = ['arrows', 'wheel', 'tilt'];

export function steerMode(): SteerMode {
  const v = storage.get<string>(KEY, '');
  if ((MODES as string[]).includes(v)) return v as SteerMode;
  return storage.get<boolean>(OLD_TILT_KEY, false) ? 'tilt' : 'arrows';
}

export function setSteerMode(m: SteerMode): void {
  storage.set(KEY, m);
}

/** The choice only matters on touch screens. */
export const touchScreen = (scene: Phaser.Scene) => scene.sys.game.device.input.touch;

const SEG = 122;
const H = 84;
const W = SEG * MODES.length;

/** Draws a mode's little icon centred on (0, 0) in one colour. */
function drawIcon(g: Phaser.GameObjects.Graphics, m: SteerMode, color: number): void {
  g.clear().lineStyle(4, color, 1).fillStyle(color, 1);
  if (m === 'arrows') g.fillTriangle(-26, 0, -10, -11, -10, 11).fillTriangle(26, 0, 10, -11, 10, 11);
  else if (m === 'wheel') g.strokeCircle(0, 0, 14).lineBetween(-13, 2, 13, 2).lineBetween(0, 2, 0, 13).fillCircle(0, 2, 4);
  else g.strokeRoundedRect(-8, -14, 16, 28, 4).fillCircle(0, 9, 2);
}

/**
 * The menu's three-way STEERING switch (touch screens). Choosing TILT asks for the motion sensors
 * from inside the tap, as iOS wants; when they are refused or missing, the choice stays as it was.
 */
export function steeringMenu(scene: Phaser.Scene, x: number, y: number): void {
  let mode = steerMode();
  const left = x - W / 2;
  const segX = (i: number) => left + SEG * i + SEG / 2;
  txt(scene, x, y - H / 2 - 22, t('steerTitle'), { title: true, size: 18, color: '#ffd23f' });
  scene.add.graphics()
    .fillStyle(0x000000, 0.28).fillRoundedRect(left, y - H / 2 + 6, W, H, 22)
    .fillStyle(0x0b1020, 0.72).fillRoundedRect(left, y - H / 2, W, H, 22)
    .lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(left, y - H / 2, W, H, 22);
  const knob = scene.add.graphics()
    .fillStyle(0xffd23f, 1).fillRoundedRect(-SEG / 2 + 6, -H / 2 + 6, SEG - 12, H - 12, 18);
  knob.setPosition(segX(MODES.indexOf(mode)), y);
  const parts = MODES.map((m, i) => ({
    ic: scene.add.graphics().setPosition(segX(i), y - 14).setAngle(m === 'tilt' ? -22 : 0),
    lb: txt(scene, segX(i), y + 22, t(`steer_${m}`), { title: true, size: 15, color: '#ffffff', strokeThickness: 4 }),
  }));
  // the chosen mode is drawn dark on the yellow knob
  const paint = () => {
    MODES.forEach((m, i) => {
      const on = m === mode;
      drawIcon(parts[i].ic, m, on ? 0x1a1320 : 0xffffff);
      parts[i].lb.setColor(on ? '#1a1320' : '#ffffff').setStroke('#000000', on ? 0 : 4);
    });
  };
  paint();
  const choose = (m: SteerMode) => {
    mode = m;
    setSteerMode(m);
    scene.tweens.add({ targets: knob, x: segX(MODES.indexOf(m)), duration: 160, ease: 'Quad.easeOut' });
    paint();
    if (scene.cache.audio.exists('move')) scene.sound.play('move', { volume: 0.4 });
  };
  MODES.forEach((m, i) => {
    const zone = scene.add.zone(segX(i), y, SEG, H + 10).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (m === mode) return;
      if (m !== 'tilt') {
        tilt.disable();
        choose(m);
        return;
      }
      // from inside the tap: iOS shows its permission prompt only now
      void tilt.enable().then((r) => {
        if (!scene.sys.isActive()) return;
        if (r === 'on') choose('tilt');
        else popup(scene, x, y + H / 2 + 30, t(r === 'denied' ? 'tiltDenied' : 'tiltNone'), '#ff9a7a', 22);
      });
    });
  });
}
