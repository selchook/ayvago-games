// Kickflip Park: small icons drawn once into textures (the HUD's clock and mixtape).
import Phaser from 'phaser';

export const CLOCK_ICON = 'kf-clock';
export const TAPE_ICON = 'kf-tape';

export function makeIcons(scene: Phaser.Scene): void {
  if (!scene.textures.exists(CLOCK_ICON)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(32, 34, 26);
    g.fillStyle(0x1b2140, 1).fillCircle(32, 34, 20);
    g.fillStyle(0xffffff, 1).fillRect(29, 8, 6, 8).fillRect(22, 4, 20, 6);
    g.lineStyle(5, 0xffd23f, 1).lineBetween(32, 34, 32, 20).lineBetween(32, 34, 42, 38);
    g.generateTexture(CLOCK_ICON, 64, 64);
    g.destroy();
  }
  if (!scene.textures.exists(TAPE_ICON)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x2a2433, 1).fillRoundedRect(2, 12, 60, 40, 6);
    g.fillStyle(0xff6fd8, 1).fillRoundedRect(7, 16, 50, 22, 3);
    g.fillStyle(0xffffff, 1).fillRect(16, 23, 32, 11);
    g.fillStyle(0x2a2433, 1).fillCircle(24, 28, 4).fillCircle(40, 28, 4);
    g.fillStyle(0x4a4058, 1).fillRect(16, 42, 32, 8);
    g.generateTexture(TAPE_ICON, 64, 64);
    g.destroy();
  }
}
