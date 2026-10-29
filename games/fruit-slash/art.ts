import Phaser from 'phaser';

/** Fruit kinds drawn procedurally (no fitting Kenney fruit sprites exist). */
export interface FruitKind {
  key: string;
  r: number;          // radius in px
  skin: number;
  skinDark: number;
  flesh: number;
  rind: number;
  seed: number;
  juice: number;
  pts: number;
}

export const FRUITS: FruitKind[] = [
  { key: 'melon', r: 66, skin: 0x2f9e44, skinDark: 0x1b6b2c, flesh: 0xff4d5e, rind: 0xd8f5c0, seed: 0x1a1a1a, juice: 0xff4d5e, pts: 10 },
  { key: 'orange', r: 50, skin: 0xff9f1c, skinDark: 0xe07b00, flesh: 0xffc04d, rind: 0xfff1d0, seed: 0xffe8a8, juice: 0xffa62b, pts: 10 },
  { key: 'apple', r: 48, skin: 0xe02a2a, skinDark: 0x9e1515, flesh: 0xfff3c4, rind: 0xffffff, seed: 0x5a3010, juice: 0xfff0a8, pts: 10 },
  { key: 'lemon', r: 46, skin: 0xffe03d, skinDark: 0xd9b400, flesh: 0xfff38a, rind: 0xffffe0, seed: 0xfffbd0, juice: 0xfff35c, pts: 10 },
  { key: 'kiwi', r: 44, skin: 0x8a5a2b, skinDark: 0x5e3a18, flesh: 0x8fd14f, rind: 0xd9f2b0, seed: 0x111111, juice: 0x9be35a, pts: 10 },
  { key: 'plum', r: 42, skin: 0x8e3fd1, skinDark: 0x5c1f96, flesh: 0xf2d16b, rind: 0xffe9a8, seed: 0x7a4b1d, juice: 0xc77dff, pts: 10 },
];

export const ICE: FruitKind = { key: 'ice', r: 46, skin: 0x5ee8ff, skinDark: 0x1f9fd1, flesh: 0xd8faff, rind: 0xffffff, seed: 0x9fe8ff, juice: 0xbff4ff, pts: 20 };
export const STAR: FruitKind = { key: 'star', r: 48, skin: 0xffd23f, skinDark: 0xe0a800, flesh: 0xfff6c0, rind: 0xffffff, seed: 0xffb000, juice: 0xffe066, pts: 50 };

function fruitWhole(g: Phaser.GameObjects.Graphics, f: FruitKind): void {
  const r = f.r, c = r + 4;
  g.clear();
  // drop shadow
  g.fillStyle(0x000000, 0.25).fillCircle(c + 4, c + 6, r);
  if (f.key === 'lemon') {
    g.fillStyle(f.skinDark).fillEllipse(c, c, r * 2.1, r * 1.7);
    g.fillStyle(f.skin).fillEllipse(c - 2, c - 3, r * 1.95, r * 1.55);
    g.fillStyle(f.skinDark).fillCircle(c + r - 2, c, 6);
    g.fillStyle(f.skinDark).fillCircle(c - r + 2, c, 6);
  } else {
    g.fillStyle(f.skinDark).fillCircle(c, c, r);
    g.fillStyle(f.skin).fillCircle(c - 3, c - 4, r - 4);
  }
  if (f.key === 'melon') {
    for (let k = -2; k <= 2; k++) {
      const x = c + k * 24;
      const h = Math.sqrt(Math.max(0, r * r - (k * 24) ** 2)) - 6;
      g.lineStyle(8, f.skinDark, 0.9).lineBetween(x, c - h, x + (k % 2 ? 6 : -6), c + h);
    }
  }
  if (f.key === 'orange') {
    g.fillStyle(f.skinDark, 0.5);
    for (let k = 0; k < 26; k++) {
      const a = k * 2.4, d = (k * 7) % (r - 12);
      g.fillCircle(c + Math.cos(a) * d, c + Math.sin(a) * d, 2);
    }
    g.fillStyle(0x3a7d1e).fillEllipse(c + 4, c - r + 6, 18, 9);
  }
  if (f.key === 'apple') {
    g.lineStyle(6, 0x5a3010, 1).lineBetween(c, c - r + 8, c + 6, c - r - 2);
    g.fillStyle(0x3fa34d).fillEllipse(c + 18, c - r + 4, 26, 12);
  }
  if (f.key === 'kiwi') {
    g.fillStyle(0x5e3a18, 0.6);
    for (let k = 0; k < 40; k++) {
      const a = k * 2.1, d = (k * 11) % (r - 6);
      g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 3);
    }
  }
  if (f.key === 'plum') {
    g.lineStyle(3, f.skinDark, 0.8).beginPath();
    g.arc(c + 10, c, r - 10, -1.9, 1.9);
    g.strokePath();
    g.lineStyle(5, 0x5a3010, 1).lineBetween(c, c - r + 6, c - 4, c - r - 4);
  }
  if (f.key === 'ice') {
    g.lineStyle(5, 0xffffff, 0.95);
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.lineBetween(c - Math.cos(a) * (r - 12), c - Math.sin(a) * (r - 12), c + Math.cos(a) * (r - 12), c + Math.sin(a) * (r - 12));
    }
    g.fillStyle(0xffffff).fillCircle(c, c, 7);
  }
  if (f.key === 'star') {
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.35 : r * 0.72;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * rr, c + Math.sin(a) * rr));
    }
    g.fillStyle(0xffffff, 0.9).fillPoints(pts, true);
  }
  // highlight
  g.fillStyle(0xffffff, 0.35).fillEllipse(c - r * 0.38, c - r * 0.42, r * 0.55, r * 0.32);
  g.fillStyle(0xffffff, 0.6).fillCircle(c - r * 0.5, c - r * 0.5, 4);
}

/** Half fruit: dome of skin on top, the cut face (rind + flesh + seeds) along the flat bottom edge. */
function fruitHalf(g: Phaser.GameObjects.Graphics, f: FruitKind): void {
  const r = f.r, c = r + 4, base = r + 4;
  g.clear();
  g.fillStyle(f.skinDark).slice(c, base, r, Math.PI, 0, false).fillPath();
  g.fillStyle(f.rind).slice(c, base, r - 6, Math.PI, 0, false).fillPath();
  g.fillStyle(f.flesh).slice(c, base, r - 12, Math.PI, 0, false).fillPath();
  g.fillStyle(f.seed);
  if (f.key === 'melon') for (let k = 0; k < 9; k++) {
    const a = Math.PI + 0.3 + k * 0.33, d = r * 0.55 + (k % 2) * 8;
    g.fillEllipse(c + Math.cos(a) * d, base + Math.sin(a) * d, 6, 10);
  }
  else if (f.key === 'kiwi') {
    g.fillStyle(0xf4ffe0).slice(c, base, r * 0.28, Math.PI, 0, false).fillPath();
    g.fillStyle(f.seed);
    for (let k = 0; k < 10; k++) {
      const a = Math.PI + 0.15 + k * 0.31;
      g.fillCircle(c + Math.cos(a) * r * 0.42, base + Math.sin(a) * r * 0.42, 2.5);
    }
  } else if (f.key === 'orange' || f.key === 'lemon') {
    g.lineStyle(3, f.rind, 0.9);
    for (let k = 1; k < 6; k++) {
      const a = Math.PI + (k * Math.PI) / 6;
      g.lineBetween(c, base, c + Math.cos(a) * (r - 12), base + Math.sin(a) * (r - 12));
    }
  } else if (f.key === 'apple' || f.key === 'plum') {
    g.fillEllipse(c - 9, base - 12, 7, 12);
    g.fillEllipse(c + 9, base - 12, 7, 12);
  } else {
    g.fillStyle(f.seed).fillCircle(c, base - r * 0.3, 6);
  }
  // juicy edge line
  g.fillStyle(0xffffff, 0.35).fillRect(c - r + 8, base - 4, (r - 8) * 2, 3);
}

export function makeFruitTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('fruit-melon')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (const f of [...FRUITS, ICE, STAR]) {
    const size = (f.r + 4) * 2 + 8;
    fruitWhole(g, f);
    g.generateTexture(`fruit-${f.key}`, size, size);
    fruitHalf(g, f);
    g.generateTexture(`half-${f.key}`, (f.r + 4) * 2, f.r + 6);
  }
  // blade tip for the keyboard cursor
  g.clear();
  g.fillStyle(0x3ee6ff, 0.35).fillCircle(24, 24, 22);
  g.fillStyle(0xffffff, 1).fillCircle(24, 24, 8);
  g.lineStyle(3, 0xffffff, 0.9).strokeCircle(24, 24, 16);
  g.generateTexture('blade', 48, 48);
  // fuse spark
  g.clear();
  g.fillStyle(0xffffff, 1).fillCircle(5, 5, 5);
  g.generateTexture('spark', 10, 10);
  // miss marks
  g.clear();
  g.lineStyle(10, 0x000000, 0.6).lineBetween(8, 8, 44, 44).lineBetween(44, 8, 8, 44);
  g.lineStyle(6, 0xffffff, 1).lineBetween(8, 8, 44, 44).lineBetween(44, 8, 8, 44);
  g.generateTexture('xmark', 52, 52);
  g.destroy();
}
