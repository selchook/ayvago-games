// Rooftop Courier: small icons drawn once into textures (the HUD's parcel, stamp, mission flag
// and spring).
import Phaser from 'phaser';

export const PARCEL_ICON = 'rc-parcel';
export const STAMP_ICON = 'rc-stamp';
export const FLAG_ICON = 'rc-flag';
export const SPRING_ICON = 'rc-spring';

export function makeIcons(scene: Phaser.Scene): void {
  const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, 64, 64);
    g.destroy();
  };
  make(PARCEL_ICON, (g) => {
    g.fillStyle(0xc98a4a, 1).fillRoundedRect(6, 14, 52, 42, 5);
    g.fillStyle(0xe0a560, 1).fillRect(6, 14, 52, 12);
    g.fillStyle(0x8a5a2a, 1).fillRect(28, 14, 8, 42);
    g.fillStyle(0xffffff, 1).fillRect(12, 36, 12, 8);
  });
  make(STAMP_ICON, (g) => {
    g.fillStyle(0xfbf6ea, 1).fillRect(8, 4, 48, 56);
    g.fillStyle(0xff7a3d, 1).fillRect(14, 10, 36, 44);
    g.fillStyle(0xfff1c2, 1).fillCircle(32, 30, 9);
    g.fillStyle(0x5a2c4a, 1).fillRect(14, 40, 36, 14);
    g.fillStyle(0x201e1d, 1);
    for (let y = 8; y < 60; y += 8) { g.fillCircle(8, y, 2.4); g.fillCircle(56, y, 2.4); }
  });
  make(FLAG_ICON, (g) => {
    g.fillStyle(0xffffff, 1).fillRect(14, 6, 6, 54);
    g.fillStyle(0x7dffa0, 1).fillTriangle(20, 8, 56, 20, 20, 34);
  });
  make(SPRING_ICON, (g) => {
    g.lineStyle(6, 0xffd23f, 1);
    for (let i = 0; i < 4; i++) g.strokeEllipse(32, 14 + i * 12, 34, 12);
  });
}
