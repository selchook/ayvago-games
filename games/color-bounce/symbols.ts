import Phaser from 'phaser';

/**
 * Six colours, far apart in hue and lightness. Every colour also has its own symbol
 * (circle, square, triangle, diamond, plus, star), so the game reads without colour vision.
 */
export const PALETTE = [
  0xe8433a, // red     circle
  0x3b6fe0, // blue    square
  0xffd83a, // yellow  triangle
  0x35b85a, // green   diamond
  0x9b4fd8, // purple  plus
  0x45dcf2, // cyan    star
];

export const SYM_SIZE = 64;

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

function symbolPath(g: Phaser.GameObjects.Graphics, id: number, s: number): void {
  const c = s / 2, r = s * 0.34;
  switch (id) {
    case 0: g.fillCircle(c, c, r); g.strokeCircle(c, c, r); break;
    case 1: g.fillRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7); g.strokeRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7); break;
    case 2: {
      const pts = [V(c, c - r * 1.05), V(c + r * 1.05, c + r * 0.8), V(c - r * 1.05, c + r * 0.8)];
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 3: {
      const pts = [V(c, c - r * 1.15), V(c + r * 0.9, c), V(c, c + r * 1.15), V(c - r * 0.9, c)];
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 4: {
      const w = r * 0.4;
      const pts = [[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]]
        .map(([x, y]) => V(c + x, c + y));
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    default: {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.48 : r * 1.12;
        pts.push(V(c + Math.cos(a) * rr, c + Math.sin(a) * rr));
      }
      g.fillPoints(pts, true); g.strokePoints(pts, true);
    }
  }
}

/** White symbols with a dark outline: textures sym-0 .. sym-5 (SYM_SIZE px). */
export function makeSymbols(scene: Phaser.Scene): void {
  for (let id = 0; id < PALETTE.length; id++) {
    const key = `sym-${id}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).lineStyle(5, 0x000000, 0.75);
    symbolPath(g, id, SYM_SIZE);
    g.generateTexture(key, SYM_SIZE, SYM_SIZE);
    g.destroy();
  }
}

/** Screen flash that never fully covers the view. */
export function softFlash(scene: Phaser.Scene, color: number, ms = 120, alpha = 0.35): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms * 2, onComplete: () => r.destroy() });
}

/** Big banner text that pops in and fades (level / wave announcements). */
export function banner(scene: Phaser.Scene, y: number, s: string, color = '#ffd23f', size = 44): void {
  const t = scene.add.text(scene.scale.width / 2, y, s, {
    fontFamily: '"Press Start 2P", monospace', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 10, align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(7000).setScale(0.3);
  scene.tweens.add({ targets: t, scale: 1, duration: 350, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
}
