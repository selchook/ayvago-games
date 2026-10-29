import Phaser from 'phaser';

export const W = 1280;
export const H = 720;
export const GROUND = 620;

/** WA-style ten ring face: white, black, blue, red, gold (two rings each). */
export const RING_COLORS = [0xf4f4f4, 0xf4f4f4, 0x262626, 0x262626, 0x2f8fd8, 0x2f8fd8, 0xe8332a, 0xe8332a, 0xffd23f, 0xffd23f];

export function makeArcheryTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('face')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const R = 128;
  g.fillStyle(0x000000, 0.25).fillCircle(R + 4, R + 6, R - 2);
  for (let k = 0; k < 10; k++) {
    const r = R - 4 - k * ((R - 4) / 10);
    g.fillStyle(RING_COLORS[k]).fillCircle(R, R, r);
    g.lineStyle(k === 2 || k === 3 ? 1.5 : 2, k === 2 || k === 3 ? 0x888888 : 0x000000, 0.45).strokeCircle(R, R, r);
  }
  g.lineStyle(2, 0x000000, 0.5).strokeCircle(R, R, (R - 4) / 20);
  g.lineStyle(5, 0x7a4a1f, 1).strokeCircle(R, R, R - 3);
  g.generateTexture('face', R * 2 + 8, R * 2 + 8);

  // arrow pointing right, tip at the right edge
  g.clear();
  g.fillStyle(0x8a5a2b).fillRect(14, 5, 66, 4);
  g.fillStyle(0xc9cdd8).fillTriangle(78, 1, 92, 7, 78, 13);
  g.fillStyle(0xec3013).fillTriangle(0, 0, 20, 5, 6, 7).fillTriangle(0, 14, 20, 9, 6, 7);
  g.fillStyle(0xffffff).fillRect(18, 5, 4, 4);
  g.generateTexture('arrow', 92, 14);

  // aim dot
  g.clear();
  g.fillStyle(0xffffff).fillCircle(5, 5, 5);
  g.generateTexture('dot', 10, 10);

  // sky: horizontal bands (texture generation has no gradient fills)
  g.clear();
  const top = [0x4f9ff0], bands = 24;
  for (let k = 0; k < bands; k++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(top[0]), Phaser.Display.Color.ValueToColor(0xd4f0ff), bands - 1, k);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (k * H) / bands, 16, H / bands + 1);
  }
  g.generateTexture('sky', 16, H);

  // ground strip
  g.clear();
  // ground strip: grass blades on top (12 px), turf below; drawn with its top at GROUND - 12
  g.fillStyle(0x6fd35a).fillTriangle(10, 12, 14, 2, 18, 12).fillTriangle(70, 12, 75, 0, 80, 12).fillTriangle(104, 12, 107, 4, 110, 12);
  g.fillStyle(0x58b947).fillRect(0, 12, 128, 14);
  g.fillStyle(0x3f9a37).fillRect(0, 26, 128, 120);
  g.fillStyle(0x2f7f2b);
  for (let k = 0; k < 10; k++) g.fillRect((k * 37) % 120, 38 + ((k * 23) % 80), 6, 4);
  g.generateTexture('turf', 128, 112);
  g.destroy();
}
