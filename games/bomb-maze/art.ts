import Phaser from 'phaser';

export const CELL = 52;

/** Procedural tiles: floor checker, flame, power-up plates and the on-screen pad. */
export function makeMazeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('floor-a')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const S = CELL;
  for (const [key, base, dot] of [['floor-a', 0x3f8f4a, 0x4a9e55], ['floor-b', 0x37803f, 0x418d4a]] as Array<[string, number, number]>) {
    g.clear();
    g.fillStyle(base).fillRect(0, 0, S, S);
    g.fillStyle(dot, 1).fillRect(6, 8, 4, 4).fillRect(30, 20, 4, 4).fillRect(16, 38, 4, 4).fillRect(42, 42, 3, 3);
    g.fillStyle(0x000000, 0.08).fillRect(0, S - 3, S, 3);
    g.generateTexture(key, S, S);
  }
  // flame cell: orange glow, yellow body, white core
  g.clear();
  g.fillStyle(0xff5a1a, 0.9).fillRoundedRect(1, 1, S - 2, S - 2, 14);
  g.fillStyle(0xffb21a).fillRoundedRect(7, 7, S - 14, S - 14, 11);
  g.fillStyle(0xfff3a0).fillRoundedRect(15, 15, S - 30, S - 30, 7);
  g.generateTexture('fire', S, S);

  // power-up plates
  const plate = (key: string, col: number, draw: () => void) => {
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(5, 7, S - 8, S - 8, 10);
    g.fillStyle(col).fillRoundedRect(3, 3, S - 8, S - 8, 10);
    g.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(3, 3, S - 8, S - 8, 10);
    draw();
    g.generateTexture(key, S, S);
  };
  plate('pu-range', 0xd9471a, () => {
    // flame icon
    g.fillStyle(0xffd23f).fillTriangle(23, 9, 36, 30, 10, 30);
    g.fillStyle(0xffd23f).fillCircle(23, 31, 13);
    g.fillStyle(0xffffff).fillCircle(23, 33, 6);
  });
  plate('pu-bomb', 0x3b4188, () => {
    g.fillStyle(0x111118).fillCircle(22, 28, 12);
    g.fillStyle(0x666677).fillCircle(18, 24, 4);
    g.lineStyle(3, 0xc9a26b).lineBetween(30, 18, 35, 11);
    g.fillStyle(0xffd23f).fillCircle(36, 10, 3);
    g.lineStyle(3, 0xffffff).lineBetween(36, 26, 36, 38).lineBetween(30, 32, 42, 32);
  });
  plate('pu-speed', 0x2fa84f, () => {
    g.fillStyle(0xffffff).fillPoints([
      new Phaser.Math.Vector2(27, 7), new Phaser.Math.Vector2(13, 27), new Phaser.Math.Vector2(22, 27),
      new Phaser.Math.Vector2(18, 41), new Phaser.Math.Vector2(34, 19), new Phaser.Math.Vector2(25, 19),
    ], true);
  });

  // spark particle
  g.clear();
  g.fillStyle(0xffffff).fillCircle(4, 4, 4);
  g.generateTexture('spark', 8, 8);

  // d-pad arrow
  g.clear();
  g.fillStyle(0xffffff, 1).fillTriangle(0, 30, 26, 0, 52, 30);
  g.generateTexture('arrow', 52, 30);
  g.destroy();
}
