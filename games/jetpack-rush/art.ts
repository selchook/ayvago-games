import Phaser from 'phaser';
import { CHARACTER_FRAME } from '@core';

export const W = 1280;
export const H = 720;
export const CEIL = 92;     // top of the corridor
export const FLOOR = 636;   // feet touch here

// The hero is the player's character, as tall as the old 0.5-scale alien (92 px standing). The origin
// sits mid-body, 46 px above the feet, so the hero's y is the centre the collisions use.
export const HERO_SCALE = 92 / CHARACTER_FRAME.standHeight;
export const HERO_ORIGIN_Y = CHARACTER_FRAME.originY - 46 / HERO_SCALE / CHARACTER_FRAME.height;

/** Procedural lab corridor art: wall tile, floor tile, zapper orb, missile warning, shield bubble. */
export function makeLabTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('lab-wall')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // back wall: 320 px wide panel repeated
  g.fillStyle(0x161a2e).fillRect(0, 0, 320, H);
  g.fillStyle(0x1d2340).fillRect(8, CEIL + 20, 304, FLOOR - CEIL - 40);
  g.fillStyle(0x232a4d).fillRect(20, CEIL + 34, 280, 180);
  g.fillStyle(0x232a4d).fillRect(20, CEIL + 234, 280, 260);
  g.lineStyle(2, 0x2f3866, 1).strokeRect(20, CEIL + 34, 280, 180).strokeRect(20, CEIL + 234, 280, 260);
  // rivets
  g.fillStyle(0x3a4478);
  for (const [x, y] of [[30, CEIL + 44], [290, CEIL + 44], [30, CEIL + 204], [290, CEIL + 204], [30, CEIL + 244], [290, CEIL + 244], [30, CEIL + 484], [290, CEIL + 484]]) g.fillCircle(x, y, 4);
  // pipes
  g.fillStyle(0x2b3256).fillRect(0, CEIL + 4, 320, 14);
  g.fillStyle(0x3d4677).fillRect(0, CEIL + 6, 320, 4);
  g.fillStyle(0x2b3256).fillRect(150, CEIL + 18, 20, FLOOR - CEIL - 18);
  g.fillStyle(0x394270).fillRect(154, CEIL + 18, 5, FLOOR - CEIL - 18);
  // warning lamp + screen
  g.fillStyle(0x0d1020).fillRect(48, CEIL + 64, 80, 54);
  g.fillStyle(0x1f6f5a).fillRect(52, CEIL + 68, 72, 46);
  g.fillStyle(0x5dff7a, 0.6);
  for (let k = 0; k < 4; k++) g.fillRect(58, CEIL + 74 + k * 10, 20 + ((k * 17) % 40), 4);
  g.fillStyle(0xffd23f, 0.85).fillCircle(240, CEIL + 90, 12);
  g.fillStyle(0xffffff, 0.6).fillCircle(236, CEIL + 86, 4);
  // hazard stripes at the bottom of the wall
  for (let x = -40; x < 320; x += 40) {
    g.fillStyle(0xffd23f, 0.5).fillTriangle(x, FLOOR, x + 20, FLOOR, x + 40, FLOOR - 20);
    g.fillStyle(0xffd23f, 0.5).fillTriangle(x + 20, FLOOR, x + 40, FLOOR - 20, x + 40, FLOOR);
  }
  g.fillStyle(0x0b0d18).fillRect(0, FLOOR - 24, 320, 4);
  g.generateTexture('lab-wall', 320, H);

  // floor and ceiling strip: 128 px tile
  g.clear();
  g.fillStyle(0x2d3350).fillRect(0, 0, 128, 84);
  g.fillStyle(0x454e78).fillRect(0, 0, 128, 8);
  g.fillStyle(0x1b2036).fillRect(0, 8, 128, 4);
  g.fillStyle(0x394166).fillRect(4, 18, 56, 26).fillRect(68, 18, 56, 26);
  g.fillStyle(0x23293f).fillRect(4, 50, 120, 30);
  g.fillStyle(0x5a6599).fillCircle(10, 24, 3).fillCircle(54, 24, 3).fillCircle(74, 24, 3).fillCircle(118, 24, 3);
  g.generateTexture('lab-floor', 128, 84);

  // zapper orb
  g.clear();
  g.fillStyle(0x000000, 0.4).fillCircle(26, 28, 22);
  g.fillStyle(0x6b7398).fillCircle(24, 24, 22);
  g.fillStyle(0x9aa3c8).fillCircle(22, 21, 17);
  g.fillStyle(0x30364f).fillCircle(24, 24, 12);
  g.fillStyle(0xffe14d).fillCircle(24, 24, 8);
  g.fillStyle(0xffffff).fillCircle(22, 22, 3);
  g.generateTexture('orb', 50, 50);

  // missile warning
  g.clear();
  g.fillStyle(0xec3013).fillTriangle(36, 2, 70, 64, 2, 64);
  g.fillStyle(0xffd23f).fillTriangle(36, 12, 61, 58, 11, 58);
  g.fillStyle(0x201e1d).fillRect(32, 26, 8, 20).fillRect(32, 50, 8, 6);
  g.generateTexture('warn', 72, 66);

  // shield bubble
  g.clear();
  g.fillStyle(0x3ee6ff, 0.18).fillCircle(64, 64, 62);
  g.lineStyle(5, 0x3ee6ff, 0.9).strokeCircle(64, 64, 60);
  g.fillStyle(0xffffff, 0.5).fillEllipse(42, 38, 30, 16);
  g.generateTexture('bubble', 128, 128);

  // jetpack
  g.clear();
  g.fillStyle(0x3b3f52).fillRoundedRect(0, 0, 30, 58, 8);
  g.fillStyle(0xd0d4e0).fillRoundedRect(4, 4, 22, 40, 6);
  g.fillStyle(0xec3013).fillRect(4, 14, 22, 8);
  g.fillStyle(0x23252f).fillRect(8, 48, 14, 10);
  g.generateTexture('jetpack', 30, 58);

  // missile, nose to the left
  g.clear();
  g.fillStyle(0x8a1a10).fillTriangle(70, 2, 92, 2, 76, 14).fillTriangle(70, 34, 92, 34, 76, 22);
  g.fillStyle(0xd8dce8).fillRoundedRect(18, 7, 62, 22, 6);
  g.fillStyle(0xec3013).fillRect(40, 7, 14, 22);
  g.fillStyle(0xec3013).fillTriangle(0, 18, 20, 7, 20, 29);
  g.fillStyle(0xffffff, 0.6).fillRect(22, 10, 50, 4);
  g.fillStyle(0x3b3f52).fillRect(80, 10, 8, 16);
  g.generateTexture('missile', 94, 36);

  // soft round particle
  g.clear();
  g.fillStyle(0xffffff).fillCircle(8, 8, 8);
  g.generateTexture('dot', 16, 16);
  g.destroy();
}
