import Phaser from 'phaser';
import { CAP } from './logic';

/** Ten liquids, far apart in hue and lightness; every one also carries its own symbol. */
export const LIQUIDS = [
  0xe8433a, // red      circle
  0x3b6fe0, // blue     square
  0xffd83a, // yellow   triangle
  0x35b85a, // green    diamond
  0xff8a1f, // orange   star
  0x9b4fd8, // purple   plus
  0x45dcf2, // cyan     cross
  0xff6fc8, // pink     heart
  0xe9e9e9, // white    ring
  0x8a5a2b, // brown    bars
];

export const LAYER_H = 54;           // one layer of liquid, world px
export const TUBE_W = 74;            // outer glass width
export const INNER_W = 58;           // liquid width
export const NECK = 26;              // empty glass above a full tube
export const TUBE_H = CAP * LAYER_H + NECK + 10;

const SYM = 30;

function symbolPath(g: Phaser.GameObjects.Graphics, id: number, s: number): void {
  const c = s / 2, r = s * 0.36;
  switch (id) {
    case 0: g.fillCircle(c, c, r); g.strokeCircle(c, c, r); break;
    case 1: g.fillRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7); g.strokeRect(c - r * 0.85, c - r * 0.85, r * 1.7, r * 1.7); break;
    case 2: g.fillTriangle(c, c - r, c + r, c + r * 0.8, c - r, c + r * 0.8); g.strokeTriangle(c, c - r, c + r, c + r * 0.8, c - r, c + r * 0.8); break;
    case 3: {
      const pts = [new Phaser.Math.Vector2(c, c - r * 1.1), new Phaser.Math.Vector2(c + r * 0.9, c), new Phaser.Math.Vector2(c, c + r * 1.1), new Phaser.Math.Vector2(c - r * 0.9, c)];
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 4: {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r * 1.1;
        pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * rr, c + Math.sin(a) * rr));
      }
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 5: {
      const w = r * 0.42;
      const pts = [[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]]
        .map(([x, y]) => new Phaser.Math.Vector2(c + x, c + y));
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 6: {
      const w = r * 0.3, k = r * 0.95;
      const pts = [[0, -w * 1.4], [k - w, -k], [k, -k + w], [w * 1.4, 0], [k, k - w], [k - w, k], [0, w * 1.4], [-k + w, k], [-k, k - w], [-w * 1.4, 0], [-k, -k + w], [-k + w, -k]]
        .map(([x, y]) => new Phaser.Math.Vector2(c + x, c + y));
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 7: {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 40; i++) {
        const tt = (i / 40) * Math.PI * 2;
        const x = 16 * Math.sin(tt) ** 3, y = -(13 * Math.cos(tt) - 5 * Math.cos(2 * tt) - 2 * Math.cos(3 * tt) - Math.cos(4 * tt));
        pts.push(new Phaser.Math.Vector2(c + (x / 17) * r, c + (y / 17) * r + 1));
      }
      g.fillPoints(pts, true); g.strokePoints(pts, true); break;
    }
    case 8: g.lineStyle(9, 0x000000, 1).strokeCircle(c, c, r * 0.85); g.lineStyle(5, 0xffffff, 1).strokeCircle(c, c, r * 0.85); break;
    default: {
      const h = r * 0.5;
      g.fillRect(c - r, c - r * 0.75, r * 2, h); g.strokeRect(c - r, c - r * 0.75, r * 2, h);
      g.fillRect(c - r, c + r * 0.25, r * 2, h); g.strokeRect(c - r, c + r * 0.25, r * 2, h);
    }
  }
}

/** White symbols with a dark outline (sym-0..9), readable on every liquid. */
export function makeTextures(scene: Phaser.Scene): void {
  for (let id = 0; id < LIQUIDS.length; id++) {
    const key = `sym-${id}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).lineStyle(3, 0x000000, 0.85);
    symbolPath(g, id, SYM);
    g.generateTexture(key, SYM, SYM);
    g.destroy();
  }
  if (!scene.textures.exists('ws-dot')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('ws-dot', 16, 16);
    g.destroy();
  }
}

/**
 * Draws one tube's liquid into `g`, in tube-local coordinates: (0, 0) is the mouth, the glass
 * hangs down to y = TUBE_H. `extra` adds a partial layer on top (pour in progress), `drain`
 * removes a fraction of layers from the top.
 */
export function drawLiquid(g: Phaser.GameObjects.Graphics, layers: number[], drain = 0, extra?: { colour: number; amount: number }): void {
  g.clear();
  const bottom = TUBE_H - 8;
  const half = INNER_W / 2;
  let h = layers.length - drain;
  let y = bottom;
  // the rounded glass bottom: the first layer gets rounded lower corners
  for (let i = 0; i < layers.length && h > 0; i++) {
    const amt = Math.min(1, h);
    h -= amt;
    const hh = amt * LAYER_H;
    g.fillStyle(LIQUIDS[layers[i]], 1);
    if (i === 0) g.fillRoundedRect(-half, y - hh, INNER_W, hh, { tl: 0, tr: 0, bl: 22, br: 22 });
    else g.fillRect(-half, y - hh, INNER_W, hh);
    // a lighter band at the surface of each layer
    g.fillStyle(0xffffff, 0.18).fillRect(-half, y - hh, INNER_W, Math.min(6, hh));
    y -= hh;
  }
  if (extra && extra.amount > 0) {
    const hh = extra.amount * LAYER_H;
    g.fillStyle(LIQUIDS[extra.colour], 1);
    if (y >= bottom - 0.5) g.fillRoundedRect(-half, y - hh, INNER_W, hh, { tl: 0, tr: 0, bl: 22, br: 22 });
    else g.fillRect(-half, y - hh, INNER_W, hh);
    g.fillStyle(0xffffff, 0.18).fillRect(-half, y - hh, INNER_W, Math.min(6, hh));
  }
  // glass shine over the liquid
  g.fillStyle(0xffffff, 0.16).fillRect(-half + 8, NECK, 7, bottom - NECK - 18);
}

/** The glass itself (drawn once per tube). */
export function drawGlass(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  const w = TUBE_W, half = w / 2;
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-half, 0, w, TUBE_H, { tl: 6, tr: 6, bl: 34, br: 34 });
  g.lineStyle(5, 0xd8f4ff, 0.85).strokeRoundedRect(-half, 0, w, TUBE_H, { tl: 6, tr: 6, bl: 34, br: 34 });
  // lip
  g.fillStyle(0xd8f4ff, 0.9).fillRoundedRect(-half - 6, -6, w + 12, 12, 5);
}

/** Liquid-surface y (tube-local) for a tube holding `n` layers. */
export function surfaceY(n: number): number {
  return TUBE_H - 8 - n * LAYER_H;
}
