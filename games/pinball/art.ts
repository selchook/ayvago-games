import Phaser from 'phaser';

/** Generated textures: flipper (pivot at x = 16), ball, bumper cap, spark. */
export function makeTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  if (!tex.exists('flipper')) {
    const r0 = 16, r1 = 9, len = 120, w = r0 + len + r1, h = r0 * 2;
    const shape = (pad: number, color: number) => {
      g.fillStyle(color, 1);
      g.fillCircle(r0, r0, r0 - pad);
      g.fillCircle(r0 + len, r0, r1 - pad);
      g.fillPoints([
        new Phaser.Math.Vector2(r0, pad), new Phaser.Math.Vector2(r0 + len, r0 - r1 + pad),
        new Phaser.Math.Vector2(r0 + len, r0 + r1 - pad), new Phaser.Math.Vector2(r0, h - pad),
      ], true);
    };
    shape(0, 0xffffff);
    shape(3, 0xec3013);
    g.fillStyle(0xffffff, 0.35).fillRect(r0, 8, len - 6, 3);
    g.fillStyle(0xffd23f, 1).fillCircle(r0, r0, 6);
    g.generateTexture('flipper', w, h);
    g.clear();
  }
  if (!tex.exists('ball')) {
    g.fillStyle(0x6d7685, 1).fillCircle(16, 16, 14);
    g.fillStyle(0xb9c3d1, 1).fillCircle(15, 15, 12);
    g.fillStyle(0xe6edf5, 1).fillCircle(13, 12, 7);
    g.fillStyle(0xffffff, 1).fillCircle(11, 10, 3);
    g.generateTexture('ball', 32, 32);
    g.clear();
  }
  if (!tex.exists('bumper')) {
    const c = 40;
    g.fillStyle(0x000000, 0.35).fillCircle(c + 3, c + 5, 38);
    g.fillStyle(0xffffff, 1).fillCircle(c, c, 38);
    g.fillStyle(0xff4fa3, 1).fillCircle(c, c, 34);
    g.fillStyle(0x8b5cff, 1).fillCircle(c, c, 26);
    g.fillStyle(0xffffff, 1).fillCircle(c, c, 18);
    g.fillStyle(0xffd23f, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 14;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * r, c + Math.sin(a) * r));
    }
    g.fillPoints(pts, true);
    g.generateTexture('bumper', 84, 86);
    g.clear();
  }
  if (!tex.exists('spark')) {
    g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
    g.generateTexture('spark', 12, 12);
    g.clear();
  }
  g.destroy();
}
