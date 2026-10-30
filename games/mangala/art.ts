import Phaser from 'phaser';

/** Glass-marble stones in six colours: 'mg-stone0' … 'mg-stone5' (28 px). */
export const STONE_COLORS: Array<[number, number]> = [
  [0x3ee6ff, 0x0b6f8a], [0xff4f5e, 0x8f1020], [0x5dff7a, 0x1d7a32],
  [0xffd23f, 0x9a6a00], [0xb58cff, 0x4b2a9a], [0xffffff, 0x8a8a9a],
];

export function makeStoneTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('mg-stone0')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  STONE_COLORS.forEach(([c, d], k) => {
    g.clear();
    g.fillStyle(0x000000, 0.35).fillCircle(15, 16, 12);
    g.fillStyle(d, 1).fillCircle(14, 14, 12);
    g.fillStyle(c, 0.95).fillCircle(13, 13, 10);
    g.fillStyle(0xffffff, 0.25).fillCircle(12, 11, 7);
    g.fillStyle(0xffffff, 0.85).fillCircle(9, 9, 3);
    g.generateTexture(`mg-stone${k}`, 28, 28);
  });
  g.destroy();
}

/** Wooden board with oval pits; cell centres come from `cell` (view index 0..13). */
export function drawBoard(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  cell: (v: number) => { x: number; y: number; w: number; h: number },
): void {
  g.fillStyle(0x000000, 0.45).fillRoundedRect(x + 6, y + 10, w, h, 40);
  g.fillStyle(0x7a4520).fillRoundedRect(x, y, w, h, 40);
  // grain
  for (let k = 0; k < 9; k++) g.fillStyle(k % 2 ? 0x6e3d1b : 0x85502a, 0.55).fillRect(x + 20, y + 16 + k * ((h - 32) / 9), w - 40, 10);
  g.lineStyle(6, 0x3e220c).strokeRoundedRect(x, y, w, h, 40);
  g.lineStyle(2, 0xd99a5a, 0.35).strokeRoundedRect(x + 8, y + 8, w - 16, h - 16, 34);
  for (let v = 0; v < 14; v++) {
    const c = cell(v);
    const r = Math.min(c.w, c.h) / 2;
    g.fillStyle(0xd99a5a, 0.25).fillRoundedRect(c.x - c.w / 2 - 3, c.y - c.h / 2 + 4, c.w + 6, c.h + 2, r + 3);
    g.fillStyle(0x2a1508, 1).fillRoundedRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, r);
    g.fillStyle(0x3b1f0c, 1).fillRoundedRect(c.x - c.w / 2 + 4, c.y - c.h / 2 + 8, c.w - 8, c.h - 10, r - 4);
  }
}
