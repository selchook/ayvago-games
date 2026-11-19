import Phaser from 'phaser';
import { isModern } from './style';
import { playSfx } from './audio';
import { inputMode } from './gamepad';

export interface NavItem {
  /** The button (a sized container: Button, SkinButton). */
  obj: Phaser.GameObjects.Container;
  press: () => void;
}

/**
 * Arrow-key focus over a core screen's buttons, for the keyboard and the gamepad (whose D-pad
 * and stick are the arrows, A is Enter). Enter presses the focused button; before any arrow it
 * presses `start` (the screen's main button, as Enter always did). The focus ring shows at once
 * when the player is on a gamepad, after the first arrow otherwise.
 */
export function keyNav(scene: Phaser.Scene, items: NavItem[], start = 0): void {
  const kb = scene.input.keyboard;
  if (!kb || !items.length) return;
  let i = Phaser.Math.Clamp(start, 0, items.length - 1);
  let shown = false;
  const ring = scene.add.graphics().setDepth(10000).setScrollFactor(0).setVisible(false);
  scene.tweens.add({ targets: ring, alpha: 0.45, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  const draw = () => {
    const o = items[i].obj;
    if (!o.active) return;
    const pad = 9, w = o.width * o.scaleX + pad * 2, h = o.height * o.scaleY + pad * 2;
    ring.clear();
    ring.lineStyle(5, 0xffffff, 1).strokeRoundedRect(o.x - w / 2, o.y - h / 2, w, h, isModern() ? Math.min(h / 2, 38) : 4);
  };
  const highlight = (on: boolean) => (items[i].obj as Phaser.GameObjects.Container & { setHighlight?: (v: boolean) => void }).setHighlight?.(on);
  const show = () => {
    shown = true;
    ring.setVisible(true);
    highlight(true);
    draw();
  };
  const move = (d: number) => {
    if (!shown) return show();
    highlight(false);
    i = (i + d + items.length) % items.length;
    highlight(true);
    draw();
    playSfx(scene, 'ui-click', { volume: 0.5 });
  };
  const prev = () => move(-1), next = () => move(1);
  const press = () => items[i].obj.active && items[i].press();
  kb.on('keydown-UP', prev);
  kb.on('keydown-LEFT', prev);
  kb.on('keydown-DOWN', next);
  kb.on('keydown-RIGHT', next);
  kb.on('keydown-ENTER', press);
  // the ring follows the buttons' pop-in
  const follow = () => { if (shown) draw(); };
  scene.events.on(Phaser.Scenes.Events.UPDATE, follow);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, follow);
    kb.off('keydown-UP', prev).off('keydown-LEFT', prev).off('keydown-DOWN', next).off('keydown-RIGHT', next).off('keydown-ENTER', press);
  });
  if (inputMode() === 'gamepad') show();
}
