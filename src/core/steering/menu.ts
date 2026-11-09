// The menu's three-way STEERING switch for driving games (touch screens only):
// ARROWS | WHEEL | TILT. Drop `steeringOption` into the game definition's `menuOption`.
import Phaser from 'phaser';
import { t } from '../i18n';
import { txt } from '../theme';
import { popup } from '../fx';
import { playSfx } from '../audio';
import { isModern } from '../style';
import { STEER_MODES, steerMode, setSteerMode, touchScreen, type SteerMode } from './mode';
import { tilt } from './tilt';

const SEG = 122;
const H = 84;
const W = SEG * STEER_MODES.length;
/** Portrait menus stack the switch under PLAY; its title needs a little room under PLAY's pulse. */
const PORTRAIT_DROP = 26;

/** Draws a mode's little icon centred on (0, 0) in one colour. */
function drawIcon(g: Phaser.GameObjects.Graphics, m: SteerMode, color: number): void {
  g.clear().lineStyle(4, color, 1).fillStyle(color, 1);
  if (m === 'arrows') g.fillTriangle(-26, 0, -10, -11, -10, 11).fillTriangle(26, 0, 10, -11, 10, 11);
  else if (m === 'wheel') g.strokeCircle(0, 0, 14).lineBetween(-13, 2, 13, 2).lineBetween(0, 2, 0, 13).fillCircle(0, 2, 4);
  else g.strokeRoundedRect(-8, -14, 16, 28, 4).fillCircle(0, 9, 2);
}

/**
 * Draws the STEERING switch centred on (x, y). Choosing TILT asks for the motion sensors from
 * inside the tap, as iOS wants; when they are refused or missing, the choice stays as it was.
 */
export function steeringMenu(scene: Phaser.Scene, x: number, y0: number): void {
  const portrait = scene.scale.height > scene.scale.width;
  const y = y0 + (portrait ? PORTRAIT_DROP : 0);
  const modern = isModern();
  const rad = modern ? 22 : 0;
  let mode = steerMode();
  const left = x - W / 2;
  const segX = (i: number) => left + SEG * i + SEG / 2;
  txt(scene, x, y - H / 2 - 22, t('steerTitle'), { title: true, size: 18, color: '#ffd23f' });
  const bg = scene.add.graphics()
    .fillStyle(0x000000, modern ? 0.28 : 0.55).fillRoundedRect(left, y - H / 2 + 6, W, H, rad)
    .fillStyle(modern ? 0x0b1020 : 0x16141c, modern ? 0.72 : 0.92).fillRoundedRect(left, y - H / 2, W, H, rad);
  if (modern) bg.lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(left, y - H / 2, W, H, rad);
  else bg.lineStyle(4, 0xffffff, 0.8).strokeRect(left, y - H / 2, W, H);
  const knob = scene.add.graphics()
    .fillStyle(0xffd23f, 1).fillRoundedRect(-SEG / 2 + 6, -H / 2 + 6, SEG - 12, H - 12, modern ? 18 : 0);
  if (!modern) knob.lineStyle(4, 0x000000, 1).strokeRect(-SEG / 2 + 6, -H / 2 + 6, SEG - 12, H - 12);
  knob.setPosition(segX(STEER_MODES.indexOf(mode)), y);
  const parts = STEER_MODES.map((m, i) => ({
    ic: scene.add.graphics().setPosition(segX(i), y - 14).setAngle(m === 'tilt' ? -22 : 0),
    lb: txt(scene, segX(i), y + 22, t(`steer_${m}`), { title: true, size: 15, color: '#ffffff', strokeThickness: 4 }),
  }));
  // long labels (DİREKSİYON in the wide pixel font of retro games) are shrunk to fit their segment
  for (const p of parts) if (p.lb.width > SEG - 10) p.lb.setScale((SEG - 10) / p.lb.width);
  // the chosen mode is drawn dark on the yellow knob
  const paint = () => {
    STEER_MODES.forEach((m, i) => {
      const on = m === mode;
      drawIcon(parts[i].ic, m, on ? 0x1a1320 : 0xffffff);
      // dark on the knob, without the shadow (a hard pixel shadow doubles the letters there)
      parts[i].lb.setColor(on ? '#1a1320' : '#ffffff').setStroke('#000000', on ? 0 : 4).setShadowFill(!on).setShadowStroke(!on);
    });
  };
  paint();
  const choose = (m: SteerMode) => {
    mode = m;
    setSteerMode(m);
    scene.tweens.add({ targets: knob, x: segX(STEER_MODES.indexOf(m)), duration: 160, ease: 'Quad.easeOut' });
    paint();
    // the game's own menu tick when it has one ('move'), the core click otherwise
    if (scene.cache.audio.exists('move')) playSfx(scene, 'move', { volume: 0.4, exact: true });
    else playSfx(scene, 'ui-click');
  };
  STEER_MODES.forEach((m, i) => {
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

/** The ready menu slot for a driving game: `menuOption: steeringOption` in `launch({...})`. */
export const steeringOption = { show: touchScreen, build: steeringMenu };
