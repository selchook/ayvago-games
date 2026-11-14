// Rooftop Courier: small icons drawn once into textures (the HUD's parcel, stamp, mission flag
// and spring, the six power-ups, the shop's upgrades) and the full-screen vignette of a fall.
import Phaser from 'phaser';
import type { Power } from './defs';
import type { UpgradeId } from './meta';

export const PARCEL_ICON = 'rc-parcel';
export const STAMP_ICON = 'rc-stamp';
export const FLAG_ICON = 'rc-flag';
export const SPRING_ICON = 'rc-spring';

export const POWER_ICON = (k: Power | 'spring'): string => k === 'spring' ? SPRING_ICON : 'rc-pw-' + k;
export const UPGRADE_ICON = (id: UpgradeId): string => 'rc-up-' + id;
export const VIGNETTE = 'rc-vignette';

/** A soft dark vignette (clear in the middle) as a texture: the fall's darkening, the watch's tint. */
function makeVignette(scene: Phaser.Scene): void {
  if (scene.textures.exists(VIGNETTE)) return;
  const cv = document.createElement('canvas');
  cv.width = 180; cv.height = 320;
  const g = cv.getContext('2d')!;
  const r = g.createRadialGradient(90, 150, 40, 90, 160, 210);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = r;
  g.fillRect(0, 0, 180, 320);
  scene.textures.addCanvas(VIGNETTE, cv);
}

export function makeIcons(scene: Phaser.Scene): void {
  makeVignette(scene);
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
  // ---------------------------------------------------------------- power-ups
  make(POWER_ICON('magnet'), (g) => {
    g.lineStyle(13, 0xe03434, 1).beginPath().arc(32, 30, 17, Math.PI, 0, false).strokePath();
    g.fillStyle(0xe03434, 1).fillRect(9, 29, 13, 14).fillRect(42, 29, 13, 14);
    g.fillStyle(0xe6ecf2, 1).fillRect(9, 43, 13, 10).fillRect(42, 43, 13, 10);
    g.fillStyle(0xffffff, 0.35).fillRect(17, 16, 6, 6);
  });
  make(POWER_ICON('glide'), (g) => {
    g.fillStyle(0xf8f6f0, 1).fillTriangle(4, 34, 60, 10, 26, 40);
    g.fillStyle(0xc8d8ec, 1).fillTriangle(26, 40, 60, 10, 30, 56);
    g.fillStyle(0xe0e8f2, 1).fillTriangle(26, 40, 30, 56, 22, 46);
  });
  make(POWER_ICON('shield'), (g) => {
    g.fillStyle(0x7fe0ff, 0.35).fillCircle(32, 32, 26);
    g.lineStyle(4, 0xd8f6ff, 1).strokeCircle(32, 32, 26);
    g.fillStyle(0xffffff, 0.9).fillEllipse(22, 21, 14, 7);
    g.fillStyle(0xffffff, 0.6).fillCircle(43, 42, 3);
  });
  make(POWER_ICON('double'), (g) => {
    g.fillStyle(0xfff4c8, 1).fillRect(10, 4, 44, 56);
    g.fillStyle(0xf0b020, 1).fillRect(15, 9, 34, 46);
    g.fillStyle(0x7a3a08, 1);
    // ×2 drawn as shapes (no font): a small cross and a 2
    g.lineStyle(4, 0x7a3a08, 1).lineBetween(19, 25, 27, 35).lineBetween(27, 25, 19, 35);
    g.lineStyle(5, 0x7a3a08, 1).beginPath().arc(38, 25, 6, Math.PI * 1.1, Math.PI * 0.15, false).lineTo(31, 41).lineTo(45, 41).strokePath();
    g.fillStyle(0x201e1d, 1);
    for (let y = 8; y < 60; y += 8) { g.fillCircle(10, y, 2.2); g.fillCircle(54, y, 2.2); }
  });
  make(POWER_ICON('watch'), (g) => {
    g.fillStyle(0xe8b030, 1).fillCircle(32, 36, 24).fillRect(28, 4, 8, 9);
    g.lineStyle(3, 0xf0c040, 1).strokeCircle(32, 6, 4);
    g.fillStyle(0xfbf6ea, 1).fillCircle(32, 36, 19);
    g.lineStyle(4, 0x2a2430, 1).lineBetween(32, 36, 32, 22).lineBetween(32, 36, 42, 40);
    g.fillStyle(0x6a8aff, 1).fillCircle(32, 36, 3);
  });
  make(POWER_ICON('express'), (g) => {
    g.fillStyle(0xc98a4a, 1).fillRoundedRect(8, 22, 48, 36, 4);
    g.fillStyle(0xe0304a, 1).fillRect(28, 22, 8, 36).fillRect(8, 36, 48, 8);
    g.lineStyle(6, 0xff4a5e, 1).strokeEllipse(22, 16, 22, 13).strokeEllipse(42, 16, 22, 13);
    g.fillStyle(0xe0304a, 1).fillCircle(32, 19, 5);
  });
  // ---------------------------------------------------------------- upgrades (the shop)
  make(UPGRADE_ICON('time'), (g) => {
    g.fillStyle(0xfbf6ea, 1).fillCircle(32, 34, 24);
    g.lineStyle(5, 0x7fe6ff, 1).strokeCircle(32, 34, 24);
    g.lineStyle(5, 0x2a2430, 1).lineBetween(32, 34, 32, 18).lineBetween(32, 34, 44, 38);
    g.fillStyle(0x7fe6ff, 1).fillRect(27, 2, 10, 8);
  });
  make(UPGRADE_ICON('bonus'), (g) => {
    g.fillStyle(0xc98a4a, 1).fillRoundedRect(4, 26, 34, 30, 4);
    g.fillStyle(0x8a5a2a, 1).fillRect(18, 26, 6, 30);
    g.lineStyle(5, 0x7dffa0, 1).strokeCircle(46, 22, 14);
    g.lineStyle(4, 0x7dffa0, 1).lineBetween(46, 22, 46, 14).lineBetween(46, 22, 52, 25);
    g.fillStyle(0x7dffa0, 1).fillTriangle(30, 6, 38, 6, 34, 0);
  });
  make(UPGRADE_ICON('dur'), (g) => {
    g.fillStyle(0xffd23f, 1).fillTriangle(36, 4, 14, 36, 30, 36).fillTriangle(28, 60, 50, 28, 34, 28);
    g.lineStyle(4, 0xffffff, 0.9).strokeCircle(32, 32, 28);
  });
  make(UPGRADE_ICON('magnet'), (g) => {
    g.lineStyle(12, 0xe03434, 1).beginPath().arc(32, 34, 15, Math.PI, 0, false).strokePath();
    g.fillStyle(0xe6ecf2, 1).fillRect(11, 34, 12, 12).fillRect(41, 34, 12, 12);
    g.lineStyle(3, 0xff9a9a, 0.8).beginPath().arc(32, 34, 27, Math.PI * 1.1, Math.PI * 1.9, false).strokePath();
  });
  make(UPGRADE_ICON('shield'), (g) => {
    g.fillStyle(0x7fe0ff, 0.4).fillCircle(32, 32, 26);
    g.lineStyle(4, 0xd8f6ff, 1).strokeCircle(32, 32, 26);
    g.fillStyle(0xffffff, 1).fillTriangle(32, 14, 22, 36, 42, 36).fillRect(28, 34, 8, 14);
  });
  make(UPGRADE_ICON('jump'), (g) => {
    g.fillStyle(0xffb24a, 1).fillTriangle(32, 4, 12, 30, 52, 30).fillRect(24, 30, 16, 16);
    g.fillStyle(0xffffff, 0.8).fillRect(8, 52, 48, 6);
  });
  make(UPGRADE_ICON('rush'), (g) => {
    g.fillStyle(0x7fe0ff, 1).fillTriangle(38, 2, 12, 36, 30, 36).fillTriangle(26, 62, 52, 26, 34, 26);
  });
  make(UPGRADE_ICON('stamp'), (g) => {
    g.fillStyle(0xfbf6ea, 1).fillRect(6, 8, 36, 46);
    g.fillStyle(0xff7a3d, 1).fillRect(11, 13, 26, 36);
    g.fillStyle(0xfbf6ea, 1).fillRect(22, 2, 36, 46);
    g.fillStyle(0xffd23f, 1).fillRect(27, 7, 26, 36);
    g.fillStyle(0x7a3a08, 1).fillRect(38, 15, 4, 20).fillRect(30, 23, 20, 4);
  });
  make(UPGRADE_ICON('flow'), (g) => {
    g.fillStyle(0x000000, 0.35).fillRoundedRect(4, 24, 56, 16, 8);
    g.fillStyle(0x4aa8ff, 1).fillRoundedRect(4, 24, 42, 16, 8);
    g.fillStyle(0x7fe0ff, 1).fillTriangle(46, 14, 62, 32, 46, 50);
  });
  make(UPGRADE_ICON('heart'), (g) => {
    g.fillStyle(0xff5a6a, 1).fillCircle(22, 24, 13).fillCircle(42, 24, 13).fillTriangle(10, 30, 54, 30, 32, 56);
    g.fillStyle(0xffffff, 0.5).fillCircle(18, 20, 4);
  });
}
